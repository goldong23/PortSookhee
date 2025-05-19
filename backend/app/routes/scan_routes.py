from flask import Blueprint, jsonify, request, g, current_app
import logging
import uuid
from ..scan import (
    ScanMode, ScanStatus, is_valid_target,
    start_scan_task, get_scan_status
)
from bson.objectid import ObjectId
from bson.json_util import dumps, loads

scan_bp = Blueprint('scan', __name__)
logger = logging.getLogger('app.scan')

# 스캔 작업 시작 API
@scan_bp.route('/', methods=['POST'])
def start_scan():
    """스캔 작업을 시작하는 API"""
    try:
        data = request.get_json()
        
        # 필수 파라미터 검증
        if not data or 'target' not in data or 'mode' not in data:
            return jsonify({
                'error': 'Bad Request',
                'message': '대상(target)과 모드(mode)는 필수 항목입니다.'
            }), 400
            
        target = data['target']
        mode = data['mode']
        
        # 대상 검증
        if not is_valid_target(target):
            return jsonify({
                'error': 'Bad Request',
                'message': f'잘못된 대상 형식: {target}'
            }), 400
            
        # 스캔 모드 검증
        if mode not in [ScanMode.QUICK, ScanMode.FULL, ScanMode.CUSTOM]:
            return jsonify({
                'error': 'Bad Request',
                'message': f'지원하지 않는 스캔 모드: {mode}. 지원되는 모드: quick, full, custom'
            }), 400
            
        # 고유 스캔 ID 생성
        scan_id = str(uuid.uuid4())
        
        # 스캔 설정
        kwargs = {}
        if mode == ScanMode.CUSTOM:
            # 사용자 정의 스캔의 경우 ports나 arguments가 필요함
            if 'ports' not in data and 'arguments' not in data:
                return jsonify({
                    'error': 'Bad Request',
                    'message': '사용자 정의 스캔에는 ports 또는 arguments가 필요합니다.'
                }), 400
            
            # 선택적 파라미터
            if 'ports' in data:
                kwargs['ports'] = data['ports']
            if 'arguments' in data:
                kwargs['arguments'] = data['arguments']
        
        # MongoDB에 스캔 기록 저장 (optional)
        if hasattr(g, 'mongodb_available') and g.mongodb_available:
            db = current_app.extensions['pymongo'].db
            scan_record = {
                '_id': scan_id,
                'target': target,
                'mode': mode,
                'status': ScanStatus.PENDING,
                'created_at': ObjectId().generation_time,
                'options': kwargs
            }
            db.scans.insert_one(scan_record)
        
        # 스캔 작업 시작
        result = start_scan_task(scan_id, mode, target, **kwargs)
        
        return jsonify({
            'message': '스캔 작업이 시작되었습니다.',
            'scan_id': scan_id,
            'target': target,
            'mode': mode,
            'status': ScanStatus.PENDING
        })
        
    except Exception as e:
        logger.error(f"스캔 시작 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'스캔 시작에 실패했습니다: {str(e)}'
        }), 500

# 스캔 상태 조회 API
@scan_bp.route('/<scan_id>', methods=['GET'])
def check_scan_status(scan_id):
    """스캔 작업의 상태를 조회하는 API"""
    try:
        scan_status = get_scan_status(scan_id)
        
        # 완료된 스캔의 경우 MongoDB에 결과 저장 (optional)
        if scan_status['status'] == ScanStatus.COMPLETED and \
           hasattr(g, 'mongodb_available') and g.mongodb_available:
            db = current_app.extensions['pymongo'].db
            db.scans.update_one(
                {'_id': scan_id},
                {'$set': {
                    'status': ScanStatus.COMPLETED,
                    'completed_at': ObjectId().generation_time,
                    'duration': scan_status.get('duration', 0),
                    'result': loads(dumps(scan_status.get('result', {})))
                }}
            )
        
        return jsonify(scan_status)
        
    except ValueError as e:
        logger.error(f"스캔 상태 조회 오류: {str(e)}")
        return jsonify({
            'error': 'Not Found',
            'message': str(e)
        }), 404
    except Exception as e:
        logger.error(f"스캔 상태 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'스캔 상태 조회에 실패했습니다: {str(e)}'
        }), 500

# 빠른 스캔 API 단축 경로
@scan_bp.route('/quick', methods=['POST'])
def quick_scan_api():
    """빠른 스캔 API"""
    data = request.get_json() or {}
    if 'target' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '대상(target)은 필수 항목입니다.'
        }), 400
        
    # 모드를 quick으로 설정하여 요청 변환
    data['mode'] = ScanMode.QUICK
    request.data = dumps(data).encode('utf-8')  # 요청 데이터 재설정
    return start_scan()

# 전체 스캔 API 단축 경로
@scan_bp.route('/full', methods=['POST'])
def full_scan_api():
    """전체 스캔 API"""
    data = request.get_json() or {}
    if 'target' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '대상(target)은 필수 항목입니다.'
        }), 400
        
    # 모드를 full로 설정하여 요청 변환
    data['mode'] = ScanMode.FULL
    request.data = dumps(data).encode('utf-8')  # 요청 데이터 재설정
    return start_scan()

# 사용자 정의 스캔 API 단축 경로
@scan_bp.route('/custom', methods=['POST'])
def custom_scan_api():
    """사용자 정의 스캔 API"""
    data = request.get_json() or {}
    if 'target' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '대상(target)은 필수 항목입니다.'
        }), 400
        
    # ports 또는 arguments가 없으면 에러
    if 'ports' not in data and 'arguments' not in data:
        return jsonify({
            'error': 'Bad Request',
            'message': '사용자 정의 스캔에는 ports 또는 arguments가 필요합니다.'
        }), 400
        
    # 모드를 custom으로 설정하여 요청 변환
    data['mode'] = ScanMode.CUSTOM
    request.data = dumps(data).encode('utf-8')  # 요청 데이터 재설정
    return start_scan()

# 최근 스캔 결과 목록 조회 API
@scan_bp.route('/history', methods=['GET'])
def scan_history():
    """최근 스캔 결과 목록을 조회하는 API"""
    try:
        if not hasattr(g, 'mongodb_available') or not g.mongodb_available:
            return jsonify({
                'error': 'Service Unavailable',
                'message': 'MongoDB를 사용할 수 없어 스캔 기록을 조회할 수 없습니다.'
            }), 503
            
        db = current_app.extensions['pymongo'].db
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))
        
        # 스캔 기록 조회
        scans = db.scans.find({}, {
            'result': 0  # 결과는 크기가 클 수 있으므로 제외
        }).sort('_id', -1).skip(skip).limit(limit)
        
        return jsonify({
            'scans': loads(dumps(list(scans))),
            'count': db.scans.count_documents({})
        })
        
    except Exception as e:
        logger.error(f"스캔 기록 조회 오류: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Internal Server Error',
            'message': f'스캔 기록 조회에 실패했습니다: {str(e)}'
        }), 500 