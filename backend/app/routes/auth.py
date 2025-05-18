from flask import Blueprint, request, jsonify, g
import logging
import uuid
from datetime import datetime
from bson.objectid import ObjectId
from .. import mongo, generate_token, hash_password, check_password, get_db

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger('app.auth')

@auth_bp.route('/register', methods=['POST', 'OPTIONS'])
def register():
    """사용자 회원가입 엔드포인트"""
    if request.method == 'OPTIONS':
        # CORS preflight 요청 처리
        response = jsonify({'message': 'OK'})
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response
        
    try:
        data = request.get_json()
        if not data:
            logger.error("Empty request data")
            return jsonify({"message": "요청 데이터가 비어있습니다"}), 400
        
        # 필수 입력 확인
        username = data.get('username')
        password = data.get('password')
        email = data.get('email')
        
        # 디버깅 로그
        logger.info(f"Registration attempt - Username: {username}, Email: {email}")
        
        # 필수 필드 검증
        if not username or not password:
            missing = []
            if not username: missing.append("사용자 이름")
            if not password: missing.append("비밀번호")
            return jsonify({"message": f"필수 입력 항목이 누락되었습니다: {', '.join(missing)}"}), 400
        
        # 적절한 DB 가져오기
        db = get_db()
        
        # 사용자 이름 중복 확인 (MongoDB 또는 메모리 DB)
        existing_user = db.users.find_one({'username': username})
        
        # 대소문자 무시 확인
        if not existing_user:
            import re
            pattern = re.compile(f'^{re.escape(username)}$', re.IGNORECASE)
            existing_user = db.users.find_one({'username': pattern})
            if existing_user:
                logger.info(f"Found existing username with case-insensitive match: {existing_user['username']}")
        
        if existing_user:
            logger.info(f"Username already exists: {username}")
            return jsonify({"message": "이미 존재하는 사용자 이름입니다"}), 409
            
        # 사용자 생성
        user_data = {
            'id': str(uuid.uuid4()),
            'username': username,
            'password': hash_password(password),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'role': 'user',
            'active': True
        }
        
        # 이메일이 있으면 추가
        if email:
            user_data['email'] = email
            
        # DB에 저장
        result = db.users.insert_one(user_data)
        logger.info(f"User created with ID: {result.inserted_id}")
        
        # JWT 토큰 생성
        token = generate_token(user_data)
        
        # 응답용 사용자 정보
        user_response = {
            'id': user_data['id'],
            'username': user_data['username'],
            'role': user_data['role']
        }
        if email:
            user_response['email'] = email
            
        return jsonify({
            'message': '회원가입 성공!',
            'user': user_response,
            'token': token
        }), 201
        
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return jsonify({"message": f"회원가입 처리 중 오류가 발생했습니다: {str(e)}"}), 500

@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
def login():
    """사용자 로그인 엔드포인트"""
    if request.method == 'OPTIONS':
        response = jsonify({'message': 'OK'})
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response
        
    try:
        data = request.get_json()
        if not data:
            return jsonify({"message": "요청 데이터가 비어있습니다"}), 400
            
        username = data.get('username')
        password = data.get('password')

        # 디버깅용 로그 추가
        logger.info(f"Login attempt - Username: {username}")
        
        # 필수 필드 확인
        if not password:
            return jsonify({'message': '비밀번호는 필수입니다'}), 400
            
        if not username:
            return jsonify({'message': '사용자 이름은 필수입니다'}), 400
        
        # 적절한 DB 가져오기
        db = get_db()
        
        # 사용자 찾기
        user = None
        
        # 적절한 DB 사용
        if username:
            # 정확히 일치하는 경우
            user = db.users.find_one({'username': username})
            
            # 정확한 일치가 없으면 대소문자 무시 검색 시도 (정규식 사용)
            if not user:
                import re
                pattern = re.compile(f'^{re.escape(username)}$', re.IGNORECASE)
                user = db.users.find_one({'username': pattern})
                if user:
                    logger.info(f"Found user with case-insensitive match: {user['username']}")
            
            # DB 내용 디버깅
            if not user:
                # DB의 모든 사용자 로깅 (주의: 프로덕션에서는 제거해야 함)
                users_count = db.users.count_documents({})
                logger.info(f"Total users in database: {users_count}")
                if users_count < 10:  # 사용자가 적을 때만 상세 출력
                    all_users = list(db.users.find({}, {'username': 1, 'email': 1, '_id': 1}))
                    logger.info(f"All users: {all_users}")
        else:
            # 메모리 DB에서 사용자 찾기
            if username:
                user = next((u for u in memory_db['users'] if u['username'].lower() == username.lower()), None)
            
            # 디버깅: 메모리 DB 내용 확인
            if not user:
                logger.info(f"Memory DB users: {memory_db['users']}")
        
        if not user:
            logger.warning(f"User not found - Username: {username}")
            return jsonify({'message': '존재하지 않는 사용자입니다'}), 404
        
        logger.info(f"User found: {user['username']}")
            
        # 비밀번호 확인
        if not check_password(user['password'], password):
            logger.info(f"Invalid password for user: {username}")
            return jsonify({'message': '비밀번호가 일치하지 않습니다'}), 401
        
        # 토큰 생성
        token = generate_token(user)
        logger.info(f"User logged in successfully: {user['username']}")
        
        return jsonify({
            'message': '로그인 성공',
            'user': {
                'id': user.get('id', str(user.get('_id', ''))),
                'username': user['username'],
                'role': user.get('role', 'user')
            },
            'token': token
        }), 200
            
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({'message': f'로그인 중 오류가 발생했습니다'}), 500

@auth_bp.route('/anonymous', methods=['POST'])
def anonymous_login():
    """비회원 로그인 엔드포인트"""
    try:
        logger.info("Anonymous login request received")
        
        anon_id = str(ObjectId())
        anonymous_username = f"Guest_{anon_id[:8]}"
        
        # 비회원 사용자 생성
        anon_user = {
            'id': anon_id,
            'username': anonymous_username,
            'is_anonymous': True,
            'created_at': datetime.utcnow(),
            'role': 'guest',
            'active': True
        }
        
        # DB에 저장
        result = db.users.insert_one(anon_user)
        logger.info(f"Anonymous user created with ID: {result.inserted_id}")
        
        # 토큰 생성 (선택 사항)
        token = generate_token(anon_user)
        
        return jsonify({
            'message': '비회원 로그인 성공',
            'user': {
                'id': anon_user['id'],
                'username': anon_user['username'],
                'role': anon_user['role']
            },
            'token': token
        }), 200
    
    except Exception as e:
        logger.error(f"Anonymous login error: {str(e)}")
        return jsonify({'message': f'비회원 로그인 중 오류가 발생했습니다'}), 500 