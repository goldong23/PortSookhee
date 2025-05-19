from flask import Blueprint, jsonify, request, current_app, g, send_file
import os
import subprocess
import logging
import tempfile
import shutil
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
from bson.objectid import ObjectId

openvpn_bp = Blueprint('openvpn', __name__)
logger = logging.getLogger('app.openvpn')

# OpenVPN 영구 설정 파일 저장 디렉토리
OPENVPN_CONFIG_DIR = os.environ.get('OPENVPN_CONFIG_DIR', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'openvpn'))

# 디렉토리가 없으면 생성
os.makedirs(OPENVPN_CONFIG_DIR, exist_ok=True)

# 현재 연결된 VPN 상태 저장 (임시 메모리 상태 - 실행 중인 연결용)
vpn_connections = {}
# 실행 중인 프로세스 별도 저장 (JSON 직렬화 문제 해결)
vpn_processes = {}

# 파일 업로드 진행 상태 추적
upload_status = {}

# 앱 시작 시 openvpns 컬렉션 인덱스 생성 및 VPN 연결 정리
def setup_openvpn_indexes():
    """OpenVPN 컬렉션의 인덱스를 설정합니다."""
    try:
        # MongoDB 접근 방식 수정
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
            current_app.config['MONGO_DB'] = mongo_db
        
        # 인덱스 생성
        mongo_db.openvpns.create_index([('filename', 1)])
        mongo_db.openvpns.create_index([('user_id', 1)])
        mongo_db.openvpns.create_index([('created_at', -1)])
        
        logger.info("OpenVPN 컬렉션 인덱스 생성 완료")
        
        # 이전에 실행 중이던 모든 VPN 연결 상태 초기화
        mongo_db.openvpns.update_many(
            {"status": {"$in": ["connecting", "connected"]}},
            {"$set": {"status": "disconnected", "updated_at": datetime.now().isoformat()}}
        )
        logger.info("이전 VPN 연결 상태 초기화 완료")
        
    except Exception as e:
        logger.error(f"OpenVPN 인덱스 생성 오류: {str(e)}", exc_info=True)

# 앱 종료 시 VPN 프로세스 정리
def cleanup_vpn_processes():
    """실행 중인 모든 VPN 프로세스를 정리합니다."""
    try:
        # 모든 프로세스 종료
        for connection_id, process in vpn_processes.items():
            if process and process.poll() is None:
                try:
                    process.terminate()
                    process.wait(timeout=3)
                except:
                    try:
                        process.kill()
                    except:
                        pass
                    
        # pkill로 남은 프로세스 정리
        try:
            subprocess.run(['sudo', 'pkill', '-f', 'openvpn'], timeout=5)
        except:
            pass
            
        logger.info("모든 VPN 프로세스 정리 완료")
    except Exception as e:
        logger.error(f"VPN 프로세스 정리 중 오류: {str(e)}")

@openvpn_bp.route('/status', methods=['GET'])
def get_vpn_status():
    """OpenVPN 연결 상태를 확인합니다."""
    connection_id = request.args.get('connection_id')
    user_id = request.args.get('user_id')
    
    try:
        # MongoDB 접근 방식 수정
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
            current_app.config['MONGO_DB'] = mongo_db
        
        # 특정 연결 ID가 제공된 경우
        if connection_id:
            # 데이터베이스에서 설정 찾기
            connection_doc = mongo_db.openvpns.find_one({"_id": ObjectId(connection_id)})
            
            if not connection_doc:
                return jsonify({
                    'error': 'Not Found',
                    'message': '해당 ID의 VPN 설정을 찾을 수 없습니다.'
                }), 404
            
            # 실행 중인 상태가 있으면 그것도 포함
            if connection_id in vpn_connections:
                # process 객체 제외하고 복사 - JSON 직렬화 오류 방지
                connection_info = {k: v for k, v in vpn_connections[connection_id].items() if k != 'process'}
            else:
                connection_info = {
                    'id': str(connection_doc['_id']),
                    'name': connection_doc['filename'],
                    'status': connection_doc.get('status', 'uploaded'),
                    'uploaded_at': connection_doc['created_at'],
                    'user_id': str(connection_doc['user_id']) if connection_doc.get('user_id') else None,
                    'description': connection_doc.get('description', '')
                }
                
            return jsonify(connection_info)
        
        # 사용자 ID로 필터링
        if user_id:
            # 관리자는 모든 설정 볼 수 있음
            if user_id == 'admin':
                configs = list(mongo_db.openvpns.find())
            else:
                # 문자열 ID를 ObjectId로 변환 (가능한 경우)
                try:
                    user_obj_id = ObjectId(user_id)
                    configs = list(mongo_db.openvpns.find({"user_id": user_obj_id}))
                except:
                    configs = list(mongo_db.openvpns.find({"user_id": user_id}))
                
            connections = []
            for config in configs:
                connection_info = {
                    'id': str(config['_id']),
                    'name': config['filename'],
                    'status': config.get('status', 'uploaded'),
                    'uploaded_at': config['created_at'],
                    'user_id': str(config['user_id']) if config.get('user_id') else None,
                    'description': config.get('description', '')
                }
                
                # 실행 중인 상태가 있으면 업데이트 (process 객체 제외)
                if str(config['_id']) in vpn_connections:
                    # process 필드를 제외한 모든 항목을 복사
                    for k, v in vpn_connections[str(config['_id'])].items():
                        if k != 'process':
                            connection_info[k] = v
                
                connections.append(connection_info)
                
            return jsonify({
                'connections': connections
            })
        
        # 모든 연결 상태 반환
        configs = list(mongo_db.openvpns.find())
        connections = []
        
        for config in configs:
            connection_info = {
                'id': str(config['_id']),
                'name': config['filename'],
                'status': config.get('status', 'uploaded'),
                'uploaded_at': config['created_at'],
                'user_id': str(config['user_id']) if config.get('user_id') else None,
                'description': config.get('description', '')
            }
            
            # 실행 중인 상태가 있으면 업데이트 (process 객체 제외)
            if str(config['_id']) in vpn_connections:
                # process 필드를 제외한 모든 항목을 복사
                for k, v in vpn_connections[str(config['_id'])].items():
                    if k != 'process':
                        connection_info[k] = v
            
            connections.append(connection_info)
            
        return jsonify({
            'connections': connections
        })
    
    except Exception as e:
        logger.error(f"VPN 상태 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'VPN 상태 조회에 실패했습니다: {str(e)}'
        }), 500

@openvpn_bp.route('/upload', methods=['POST'])
def upload_config():
    """OpenVPN 설정 파일을 업로드합니다."""
    if 'file' not in request.files:
        return jsonify({
            'error': 'Bad Request',
            'message': 'OpenVPN 설정 파일이 제공되지 않았습니다.'
        }), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({
            'error': 'Bad Request',
            'message': '파일이 선택되지 않았습니다.'
        }), 400
        
    if not file.filename.endswith('.ovpn'):
        return jsonify({
            'error': 'Bad Request',
            'message': '.ovpn 파일만 업로드할 수 있습니다.'
        }), 400
    
    # 사용자 ID와 설명 가져오기
    user_id = request.form.get('user_id')
    description = request.form.get('description', '')
    
    try:
        # 디렉토리 접근 가능한지 확인
        if not os.path.exists(OPENVPN_CONFIG_DIR):
            logger.error(f"OpenVPN 설정 디렉토리가 존재하지 않습니다: {OPENVPN_CONFIG_DIR}")
            os.makedirs(OPENVPN_CONFIG_DIR, exist_ok=True)
            logger.info(f"OpenVPN 설정 디렉토리를 생성했습니다: {OPENVPN_CONFIG_DIR}")
            
        # 디렉토리 쓰기 권한 확인
        if not os.access(OPENVPN_CONFIG_DIR, os.W_OK):
            logger.error(f"OpenVPN 설정 디렉토리에 쓰기 권한이 없습니다: {OPENVPN_CONFIG_DIR}")
            return jsonify({
                'error': 'Server Error',
                'message': 'OpenVPN 설정 디렉토리에 쓰기 권한이 없습니다.'
            }), 500
        
        # MongoDB 가져오기 - 수정된 방식
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
            current_app.config['MONGO_DB'] = mongo_db
        
        # MongoDB 연결 확인
        try:
            # MongoDB 연결 테스트
            mongo_db.command('ping')
            logger.info("MongoDB 연결 성공")
        except Exception as mongo_err:
            logger.error(f"MongoDB 연결 오류: {str(mongo_err)}")
            return jsonify({
                'error': 'Database Error',
                'message': f'MongoDB 연결에 실패했습니다: {str(mongo_err)}'
            }), 500
        
        # 사용자 ID를 ObjectId로 변환 (가능한 경우)
        user_obj_id = None
        if user_id and len(user_id) == 24:
            try:
                user_obj_id = ObjectId(user_id)
                # 사용자 존재 여부 확인
                user = mongo_db.users.find_one({"_id": user_obj_id})
                if not user:
                    logger.warning(f"사용자 ID에 해당하는 사용자를 찾을 수 없습니다: {user_id}")
                    user_obj_id = user_id  # 사용자가 없으면 문자열로 유지
            except Exception as user_err:
                logger.error(f"사용자 ID 변환 오류: {str(user_err)}")
                user_obj_id = user_id
        else:
            user_obj_id = user_id
            logger.info(f"사용자 ID 형식이 ObjectId가 아닙니다: {user_id}")
        
        # 안전한 파일명으로 변환
        filename = secure_filename(file.filename)
        
        # 고유 ID 생성
        connection_id = str(ObjectId())
        
        # 업로드 상태 추적 시작
        upload_status[connection_id] = {
            'status': 'uploading',
            'progress': 0,
            'filename': filename,
            'user_id': str(user_obj_id) if user_obj_id else None,
            'started_at': datetime.now().isoformat()
        }
        
        # 파일 저장 경로
        config_path = os.path.join(OPENVPN_CONFIG_DIR, f"{connection_id}_{filename}")
        logger.info(f"파일 저장 경로: {config_path}")
        
        # 파일 저장 시도
        try:
            file.save(config_path)
            if not os.path.exists(config_path):
                logger.error(f"파일이 저장되지 않았습니다: {config_path}")
                return jsonify({
                    'error': 'File System Error',
                    'message': '파일 저장에 실패했습니다: 파일이 생성되지 않음'
                }), 500
            logger.info(f"파일 저장 성공: {config_path}")
        except Exception as file_err:
            logger.error(f"파일 저장 오류: {str(file_err)}", exc_info=True)
            return jsonify({
                'error': 'File System Error',
                'message': f'파일 저장에 실패했습니다: {str(file_err)}'
            }), 500
        
        # 업로드 상태 업데이트
        upload_status[connection_id]['status'] = 'completed'
        upload_status[connection_id]['progress'] = 100
        upload_status[connection_id]['completed_at'] = datetime.now().isoformat()
        
        # 현재 시간
        now = datetime.now()
        
        # OpenVPN 설정 스키마
        openvpn_doc = {
            "_id": ObjectId(connection_id),
            "filename": filename,
            "config_path": config_path,
            "user_id": user_obj_id,  # ObjectId 또는 문자열
            "description": description,
            "status": "uploaded",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "last_connected": None,
            "last_disconnected": None,
            "connection_count": 0,
            "last_error": None,
            "metadata": {
                "file_size": os.path.getsize(config_path),
                "source": "user_upload",
                "client_ip": request.remote_addr
            }
        }
        
        # MongoDB openvpns 컬렉션에 저장 시도
        try:
            result = mongo_db.openvpns.insert_one(openvpn_doc)
            logger.info(f"MongoDB 문서 저장 성공: {result.inserted_id}")
        except Exception as db_err:
            logger.error(f"MongoDB 문서 저장 오류: {str(db_err)}", exc_info=True)
            # 파일은 저장되었지만 DB에 저장 실패한 경우, 파일 삭제 시도
            if os.path.exists(config_path):
                try:
                    os.remove(config_path)
                    logger.info(f"DB 오류로 인해 업로드된 파일 삭제: {config_path}")
                except:
                    logger.error(f"DB 오류 후 파일 삭제 실패: {config_path}")
            return jsonify({
                'error': 'Database Error',
                'message': f'데이터베이스 저장에 실패했습니다: {str(db_err)}'
            }), 500
        
        # 연결 정보 메모리에도 저장
        vpn_connections[connection_id] = {
            'id': connection_id,
            'name': filename,
            'status': 'uploaded',
            'uploaded_at': now.isoformat(),
            'config_path': config_path,
            'user_id': str(user_obj_id) if user_obj_id else None,
            'description': description,
            'last_error': None
        }
        
        logger.info(f"OpenVPN 설정 파일 업로드 완료: {filename} (ID: {connection_id}, 사용자: {user_id})")
        
        return jsonify({
            'message': 'OpenVPN 설정 파일이 업로드되었습니다.',
            'connection_id': connection_id,
            'name': filename,
            'status': 'completed',
            'user_id': str(user_obj_id) if user_obj_id else None
        })
        
    except Exception as e:
        logger.error(f"OpenVPN 설정 파일 업로드 오류 (상세): {str(e)}", exc_info=True)
        
        # 업로드 상태 업데이트 (실패)
        if 'connection_id' in locals():
            upload_status[connection_id] = {
                'status': 'failed',
                'error': str(e),
                'filename': filename if 'filename' in locals() else file.filename,
                'user_id': str(user_obj_id) if 'user_obj_id' in locals() and user_obj_id else None,
                'failed_at': datetime.now().isoformat()
            }
        
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'OpenVPN 설정 파일 업로드에 실패했습니다: {str(e)}'
        }), 500

@openvpn_bp.route('/connection/<connection_id>', methods=['DELETE'])
def delete_connection(connection_id):
    """OpenVPN 설정 파일을 삭제합니다."""
    try:
        # MongoDB 가져오기 - 수정된 방식
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        # 데이터베이스에서 설정 찾기
        connection_doc = mongo_db.openvpns.find_one({"_id": ObjectId(connection_id)})
        
        if not connection_doc:
            return jsonify({
                'error': 'Not Found',
                'message': '해당 ID의 VPN 설정을 찾을 수 없습니다.'
            }), 404
        
        # 파일 삭제
        config_path = connection_doc['config_path']
        if os.path.exists(config_path):
            os.remove(config_path)
            
        # 데이터베이스에서 삭제
        mongo_db.openvpns.delete_one({"_id": ObjectId(connection_id)})
        
        # 메모리에서도 삭제
        if connection_id in vpn_connections:
            del vpn_connections[connection_id]
            
        logger.info(f"OpenVPN 설정 파일 삭제 완료: (ID: {connection_id})")
        
        return jsonify({
            'message': 'OpenVPN 설정 파일이 삭제되었습니다.',
            'connection_id': connection_id
        })
        
    except Exception as e:
        logger.error(f"OpenVPN 설정 파일 삭제 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'OpenVPN 설정 파일 삭제에 실패했습니다: {str(e)}'
        }), 500

@openvpn_bp.route('/connect', methods=['POST'])
def connect_vpn():
    """업로드된 OpenVPN 설정 파일로 연결을 시작합니다."""
    data = request.get_json()
    
    if not data or 'connection_id' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '연결 ID가 필요합니다.'
        }), 400
        
    connection_id = data['connection_id']
    
    try:
        # MongoDB에서 설정 가져오기 - 수정된 방식
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        connection_doc = mongo_db.openvpns.find_one({"_id": ObjectId(connection_id)})
        
        if not connection_doc:
            return jsonify({
                'error': 'Not Found',
                'message': '해당 ID의 VPN 설정을 찾을 수 없습니다.'
            }), 404
            
        # 메모리에 설정 정보 없으면 생성
        if connection_id not in vpn_connections:
            vpn_connections[connection_id] = {
                'id': connection_id,
                'name': connection_doc['filename'],
                'status': 'uploaded',
                'uploaded_at': connection_doc['created_at'],
                'config_path': connection_doc['config_path'],
                'user_id': str(connection_doc['user_id']) if connection_doc.get('user_id') else None,
                'description': connection_doc.get('description', ''),
                'last_error': None
            }
            
        connection = vpn_connections[connection_id]
        config_path = connection_doc['config_path']
        
        # 사용자 자격 증명이 필요한 경우
        auth_file = None
        if 'username' in data and 'password' in data:
            try:
                # 임시 인증 파일 생성
                auth_file = os.path.join(OPENVPN_CONFIG_DIR, f"{connection_id}_auth.txt")
                with open(auth_file, 'w') as f:
                    f.write(f"{data['username']}\n{data['password']}")
            except Exception as e:
                logger.error(f"인증 파일 생성 오류: {str(e)}", exc_info=True)
                return jsonify({
                    'error': 'Internal Server Error',
                    'message': f'인증 파일 생성에 실패했습니다: {str(e)}'
                }), 500
        
        # 이미 실행 중인 프로세스가 있다면 종료
        if connection_id in vpn_processes and vpn_processes[connection_id].poll() is None:
            vpn_processes[connection_id].terminate()
                
        # OpenVPN 명령 구성
        cmd = ['sudo', 'openvpn', '--config', config_path, '--daemon']
        
        if auth_file:
            cmd.extend(['--auth-user-pass', auth_file])
        
        # OpenVPN 프로세스 시작
        process = subprocess.Popen(cmd, 
                                  stdout=subprocess.PIPE, 
                                  stderr=subprocess.PIPE)
        
        # 현재 시간
        now = datetime.now()
        
        # 상태 업데이트 - process 객체는 별도 저장
        connection['status'] = 'connecting'
        connection['started_at'] = now.isoformat()
        # process 객체는 별도 딕셔너리에 저장
        vpn_processes[connection_id] = process
        
        # MongoDB 상태 업데이트
        mongo_db.openvpns.update_one(
            {"_id": ObjectId(connection_id)},
            {"$set": {
                "status": "connecting",
                "last_connected": now.isoformat(),
                "updated_at": now.isoformat(),
                "connection_count": connection_doc.get("connection_count", 0) + 1
            }}
        )
        
        logger.info(f"OpenVPN 연결 시작 (ID: {connection_id})")
        
        return jsonify({
            'message': 'OpenVPN 연결이 시작되었습니다.',
            'connection_id': connection_id,
            'status': 'connecting'
        })
        
    except Exception as e:
        logger.error(f"OpenVPN 연결 오류: {str(e)}", exc_info=True)
        
        # 메모리 상태 업데이트
        if connection_id in vpn_connections:
            vpn_connections[connection_id]['status'] = 'failed'
            vpn_connections[connection_id]['last_error'] = str(e)
        
        # MongoDB 상태 업데이트
        try:
            mongo_db.openvpns.update_one(
                {"_id": ObjectId(connection_id)},
                {"$set": {
                    "status": "failed",
                    "updated_at": datetime.now().isoformat(),
                    "last_error": str(e)
                }}
            )
        except:
            pass
        
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'OpenVPN 연결에 실패했습니다: {str(e)}'
        }), 500
        
    finally:
        # 인증 파일 삭제 (보안)
        if auth_file and os.path.exists(auth_file):
            os.remove(auth_file)

@openvpn_bp.route('/disconnect', methods=['POST'])
def disconnect_vpn():
    """OpenVPN 연결을 종료합니다."""
    data = request.get_json()
    
    if not data or 'connection_id' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '연결 ID가 필요합니다.'
        }), 400
        
    connection_id = data['connection_id']
    
    try:
        # MongoDB에서 설정 가져오기 - 수정된 방식
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        connection_doc = mongo_db.openvpns.find_one({"_id": ObjectId(connection_id)})
        
        if not connection_doc:
            return jsonify({
                'error': 'Not Found',
                'message': '해당 ID의 VPN 설정을 찾을 수 없습니다.'
            }), 404
            
        # 메모리에 설정 정보 없으면 생성
        if connection_id not in vpn_connections:
            return jsonify({
                'error': 'Not Found',
                'message': '해당 ID의 실행 중인 VPN 연결을 찾을 수 없습니다.'
            }), 404
            
        connection = vpn_connections[connection_id]
        
        # OpenVPN 프로세스 종료
        if connection_id in vpn_processes and vpn_processes[connection_id] is not None:
            # 먼저 정상 종료 시도
            vpn_processes[connection_id].terminate()
            
            # 5초 대기 후 여전히 실행 중이면 강제 종료
            try:
                vpn_processes[connection_id].wait(timeout=5)
            except subprocess.TimeoutExpired:
                vpn_processes[connection_id].kill()
                
            # 종료 후 프로세스 객체 삭제
            del vpn_processes[connection_id]
        
        # PKill로 OpenVPN 프로세스 정리 (백업 종료 방법)
        subprocess.run(['sudo', 'pkill', '-f', f'openvpn.*{connection_id}'])
        
        # 현재 시간
        now = datetime.now()
        
        # 메모리 상태 업데이트
        connection['status'] = 'disconnected'
        connection['disconnected_at'] = now.isoformat()
        
        # MongoDB 상태 업데이트
        mongo_db.openvpns.update_one(
            {"_id": ObjectId(connection_id)},
            {"$set": {
                "status": "disconnected",
                "last_disconnected": now.isoformat(),
                "updated_at": now.isoformat()
            }}
        )
        
        logger.info(f"OpenVPN 연결 종료 (ID: {connection_id})")
        
        return jsonify({
            'message': 'OpenVPN 연결이 종료되었습니다.',
            'connection_id': connection_id,
            'status': 'disconnected'
        })
        
    except Exception as e:
        logger.error(f"OpenVPN 연결 종료 오류: {str(e)}", exc_info=True)
        
        # 메모리 상태 업데이트
        if connection_id in vpn_connections:
            vpn_connections[connection_id]['status'] = 'error'
            vpn_connections[connection_id]['last_error'] = str(e)
        
        # MongoDB 상태 업데이트
        try:
            mongo_db.openvpns.update_one(
                {"_id": ObjectId(connection_id)},
                {"$set": {
                    "status": "error",
                    "updated_at": datetime.now().isoformat(),
                    "last_error": str(e)
                }}
            )
        except:
            pass
        
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'OpenVPN 연결 종료에 실패했습니다: {str(e)}'
        }), 500

@openvpn_bp.route('/check-openvpn', methods=['GET'])
def check_openvpn():
    """OpenVPN 설치 여부를 확인합니다."""
    try:
        result = subprocess.run(['which', 'openvpn'], 
                               stdout=subprocess.PIPE, 
                               stderr=subprocess.PIPE, 
                               text=True)
        
        if result.returncode == 0:
            openvpn_path = result.stdout.strip()
            
            # 버전 확인
            version_result = subprocess.run(['openvpn', '--version'], 
                                           stdout=subprocess.PIPE, 
                                           stderr=subprocess.PIPE, 
                                           text=True)
            
            return jsonify({
                'installed': True,
                'path': openvpn_path,
                'version': version_result.stdout.split('\n')[0] if version_result.returncode == 0 else 'Unknown'
            })
        else:
            return jsonify({
                'installed': False,
                'message': 'OpenVPN이 설치되어 있지 않습니다.'
            })
            
    except Exception as e:
        logger.error(f"OpenVPN 확인 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'OpenVPN 확인에 실패했습니다: {str(e)}'
        }), 500

@openvpn_bp.route('/install-guide', methods=['GET'])
def openvpn_install_guide():
    """OpenVPN 설치 가이드를 제공합니다."""
    os_type = request.args.get('os', 'unknown').lower()
    
    guides = {
        'macos': {
            'title': 'macOS에 OpenVPN 설치 가이드',
            'steps': [
                'Homebrew를 사용하는 경우: `brew install openvpn`',
                'Tunnelblick 클라이언트를 설치하는 경우: https://tunnelblick.net/downloads.html 에서 다운로드하여 설치',
                '설치 후 시스템을 재시작하거나 터미널에서 `which openvpn`으로 설치 확인'
            ]
        },
        'windows': {
            'title': 'Windows에 OpenVPN 설치 가이드',
            'steps': [
                'OpenVPN 공식 웹사이트(https://openvpn.net/community-downloads/)에서 설치 파일 다운로드',
                '다운로드한 설치 파일 실행 및 설치 마법사 따라 설치',
                '설치 시 모든 구성 요소 설치(TAP 가상 어댑터 포함)',
                '설치 후 컴퓨터 재시작'
            ]
        },
        'linux': {
            'title': 'Linux에 OpenVPN 설치 가이드',
            'steps': [
                'Ubuntu/Debian: `sudo apt update && sudo apt install openvpn`',
                'CentOS/RHEL: `sudo yum install epel-release && sudo yum install openvpn`',
                'Arch Linux: `sudo pacman -S openvpn`',
                '설치 후 `which openvpn`으로 설치 확인'
            ]
        }
    }
    
    return jsonify(guides.get(os_type, {
        'title': 'OpenVPN 설치 가이드',
        'steps': [
            'OpenVPN 공식 웹사이트(https://openvpn.net/)에서 귀하의 운영 체제에 맞는 설치 파일 다운로드',
            '다운로드한 설치 파일을 실행하여 설치 마법사를 따라 설치',
            '설치 후 시스템을 재시작'
        ]
    }))

# 업로드 상태 확인 API 추가
@openvpn_bp.route('/upload-status/<connection_id>', methods=['GET'])
def get_upload_status(connection_id):
    """특정 파일의 업로드 상태를 확인합니다."""
    try:
        # 업로드 상태가 메모리에 있는 경우
        if connection_id in upload_status:
            return jsonify(upload_status[connection_id])
            
        # 메모리에 없는 경우 데이터베이스에서 조회
        # MongoDB 접근 방식 수정
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        connection_doc = mongo_db.openvpns.find_one({"_id": ObjectId(connection_id)})
        
        if connection_doc:
            return jsonify({
                'status': 'completed',
                'progress': 100,
                'filename': connection_doc['filename'],
                'user_id': str(connection_doc['user_id']) if connection_doc.get('user_id') else None,
                'uploaded_at': connection_doc['created_at']
            })
        
        # 찾을 수 없는 경우
        return jsonify({
            'error': 'Not Found',
            'message': '해당 ID의 업로드 정보를 찾을 수 없습니다.'
        }), 404
            
    except Exception as e:
        logger.error(f"업로드 상태 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'업로드 상태 조회에 실패했습니다: {str(e)}'
        }), 500

# 사용자별 업로드 파일 목록 조회 API 추가
@openvpn_bp.route('/user-uploads/<user_id>', methods=['GET'])
def get_user_uploads(user_id):
    """특정 사용자의 업로드 파일 목록을 조회합니다."""
    try:
        # MongoDB 접근 방식 수정
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        # 사용자 ID를 ObjectId로 변환 (가능한 경우)
        try:
            user_obj_id = ObjectId(user_id)
            # 사용자 존재 여부 확인
            user = mongo_db.users.find_one({"_id": user_obj_id})
            if not user:
                return jsonify({
                    'error': 'Not Found',
                    'message': '해당 ID의 사용자를 찾을 수 없습니다.'
                }), 404
                
        except:
            user_obj_id = user_id
        
        # 사용자의 OpenVPN 설정 파일 목록 조회
        uploads = list(mongo_db.openvpns.find({"user_id": user_obj_id}))
        
        # ObjectId를 문자열로 변환하여 JSON 직렬화 가능하게 만듦
        for upload in uploads:
            upload['_id'] = str(upload['_id'])
            if isinstance(upload.get('user_id'), ObjectId):
                upload['user_id'] = str(upload['user_id'])
        
        return jsonify({
            'user_id': user_id,
            'upload_count': len(uploads),
            'uploads': uploads
        })
            
    except Exception as e:
        logger.error(f"사용자 업로드 목록 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'사용자 업로드 목록 조회에 실패했습니다: {str(e)}'
        }), 500

# 대시보드용 사용자별 OpenVPN 통계 API 추가
@openvpn_bp.route('/user-stats/<user_id>', methods=['GET'])
def get_user_openvpn_stats(user_id):
    """사용자의 OpenVPN 사용 통계를 제공합니다."""
    try:
        # MongoDB 접근 방식 수정
        if 'MONGO_DB' in current_app.config:
            mongo_db = current_app.config['MONGO_DB']
        elif 'MONGO' in current_app.config:
            mongo_db = current_app.config['MONGO'].db
        else:
            from flask_pymongo import PyMongo
            mongo = PyMongo(current_app)
            mongo_db = mongo.db
        
        # 사용자 ID를 ObjectId로 변환 (가능한 경우)
        try:
            user_obj_id = ObjectId(user_id)
            # 사용자 존재 여부 확인
            user = mongo_db.users.find_one({"_id": user_obj_id})
            if not user:
                return jsonify({
                    'error': 'Not Found',
                    'message': '해당 ID의 사용자를 찾을 수 없습니다.'
                }), 404
                
        except:
            user_obj_id = user_id
        
        # 사용자의 OpenVPN 설정 파일 목록 조회
        uploads = list(mongo_db.openvpns.find({"user_id": user_obj_id}))
        
        # 통계 계산
        total_configs = len(uploads)
        active_configs = sum(1 for upload in uploads if upload.get('status') in ['connected', 'connecting'])
        failed_configs = sum(1 for upload in uploads if upload.get('status') in ['failed', 'error'])
        total_connections = sum(upload.get('connection_count', 0) for upload in uploads)
        
        # 최근 연결 정보
        recent_connections = list(mongo_db.openvpns.find(
            {"user_id": user_obj_id, "last_connected": {"$ne": None}}
        ).sort("last_connected", -1).limit(5))
        
        # ObjectId를 문자열로 변환
        for conn in recent_connections:
            conn['_id'] = str(conn['_id'])
            if isinstance(conn.get('user_id'), ObjectId):
                conn['user_id'] = str(conn['user_id'])
        
        return jsonify({
            'user_id': user_id,
            'total_configs': total_configs,
            'active_configs': active_configs,
            'failed_configs': failed_configs,
            'total_connections': total_connections,
            'recent_connections': recent_connections
        })
            
    except Exception as e:
        logger.error(f"사용자 OpenVPN 통계 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'사용자 OpenVPN 통계 조회에 실패했습니다: {str(e)}'
        }), 500

# 앱 시작 시 인덱스 생성 함수 등록하기 위한 코드 추가
def register_openvpn_handlers(app):
    """앱에 OpenVPN 관련 핸들러를 등록합니다."""
    with app.app_context():
        setup_openvpn_indexes()
        
    # 앱 종료 시 VPN 프로세스 정리 등록
    import atexit
    atexit.register(cleanup_vpn_processes) 