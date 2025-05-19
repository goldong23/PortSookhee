from flask import Flask, g
from flask_cors import CORS
from flask_pymongo import PyMongo
import os
import logging
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from pymongo import MongoClient
import uuid
import jwt
import bcrypt
from datetime import datetime, timedelta
from .config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Disable pymongo debug logs
logging.getLogger('pymongo').setLevel(logging.WARNING)

# MongoDB Configuration
MONGO_URI = os.environ.get('MONGODB_URL', 'mongodb://165.229.86.157:8080/PortSookhee')
DATABASE_NAME = os.environ.get('MONGODB_DB', 'PortSookhee')
JWT_SECRET = os.environ.get('JWT_SECRET', 'your_jwt_secret_key')
JWT_EXPIRATION = int(os.environ.get('JWT_EXPIRATION', 86400))  # 24시간 (초)

# 글로벌 변수 - 메모리 기반 임시 데이터 (삭제)
memory_db = None

# MongoDB 인스턴스
mongo = PyMongo()

# MongoDB 연결 상태
mongodb_available = False

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # MongoDB URI 설정
    app.config['MONGO_URI'] = MONGO_URI
    
    # 디버그: 설정된 URI 확인
    logger.info(f"Configured MongoDB URI: {app.config['MONGO_URI']}")
    
    # CORS 설정 개선 - 단순화하고 모든 리소스에 적용
    CORS(app, 
         origins=["*"],  # 모든 출처에서의 요청 허용
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With", "Origin"],
         expose_headers=["Content-Length", "X-JSON"],
         supports_credentials=False  # credentials 지원 비활성화 (CORS 단순화)
    )
    
    # 로그로 CORS 설정 확인
    logger.info("CORS 설정이 적용되었습니다")
    
    # MongoDB 연결 변수
    global mongodb_available
    
    # Initialize MongoDB with error handling
    try:
        logger.info(f"Attempting to connect to MongoDB at {app.config['MONGO_URI']}")
        
        # 연결 세부 정보 로깅
        logger.info(f"MongoDB URI: {app.config['MONGO_URI']}")
        logger.info(f"MongoDB Database: {DATABASE_NAME}")
        
        # Flask-PyMongo 초기화
        mongo.init_app(app)
        logger.info("mongo.init_app(app) completed")
        
        # 연결 테스트를 위한 앱 컨텍스트 설정
        with app.app_context():
            # 단계별 테스트
            logger.info("Testing MongoDB connection...")
            
            # 1. MongoDB 연결 객체 확인
            if mongo.cx is None:
                logger.error("mongo.cx is None - connection failed")
                raise ConnectionError("MongoDB connection object is None")
            else:
                logger.info(f"MongoDB connection established: {mongo.cx}")
                
            # 2. DB 객체 확인
            if mongo.db is None:
                logger.error("mongo.db is None - database access failed")
                raise ConnectionError("MongoDB database object is None")
            else:
                logger.info(f"MongoDB database accessed: {mongo.db}")
            
            # 3. ping 명령으로 서버 연결 확인
            logger.info("Sending ping command...")
            ping_result = mongo.db.command('ping')
            logger.info(f"Ping result: {ping_result}")
            
            # 4. DB 정보 확인
            db_info = mongo.db.command('dbStats')
            logger.info(f"Connected to MongoDB database: {db_info.get('db')} with {db_info.get('collections')} collections")
            
            # 5. 컬렉션 목록 확인
            collections = mongo.db.list_collection_names()
            logger.info(f"Available collections: {collections}")
            
            # 6. users 컬렉션 확인
            if 'users' in collections:
                users_count = mongo.db.users.count_documents({})
                logger.info(f"Found users collection with {users_count} documents")
                
                # 첫 번째 사용자 확인 (디버깅용)
                if users_count > 0:
                    sample_user = mongo.db.users.find_one()
                    if sample_user:
                        # 비밀번호 필드는 로깅하지 않음
                        if 'password' in sample_user:
                            sample_user['password'] = '***MASKED***'
                        logger.info(f"Sample user: {sample_user}")
            else:
                logger.warning("'users' collection not found in database!")
            
            mongodb_available = True
            logger.info("MongoDB connection fully verified and ready")
            
            # Setup database indexes
            setup_database(mongo.db)
            
            # 앱에 MongoDB 설정 추가 (향후 접근용)
            app.config['MONGO'] = mongo
            app.config['MONGO_DB'] = mongo.db
            
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB: {str(e)}")
        logger.error(f"Exception type: {type(e)}")
        logger.error(f"Stack trace:", exc_info=True)
        mongodb_available = False
        raise  # 에러를 상위로 전파하여 앱 시작을 중단
    
    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.main import main_bp
    from .routes.scan_routes import scan_bp
    from .routes.openvpn_routes import openvpn_bp
    from .routes.virtual_fit_routes import virtual_fit_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(main_bp, url_prefix='/api')
    app.register_blueprint(scan_bp, url_prefix='/api/scan')
    app.register_blueprint(openvpn_bp, url_prefix='/api/openvpn')
    app.register_blueprint(virtual_fit_bp, url_prefix='/api/virtual-fit')
    
    # Request hooks
    @app.before_request
    def before_request():
        """요청 처리 전 MongoDB 사용 가능 여부를 g 객체에 저장"""
        g.mongodb_available = mongodb_available
        
    return app

def setup_database(db):
    """데이터베이스 초기 설정 및 인덱스 생성"""
    try:
        # 컬렉션 존재 여부 확인
        collections = db.list_collection_names()
        
        # users 컬렉션 및 인덱스 설정
        if 'users' not in collections:
            logger.info("Creating users collection")
            db.create_collection('users')
        
        # 인덱스 정보 얻기
        user_indexes = db.users.index_information()
        
        # username 인덱스
        if 'username_1' not in user_indexes:
            db.users.create_index('username', unique=True)
            logger.info("Created unique index on users.username")
        
        # email 인덱스
        if 'email_1' not in user_indexes:
            db.users.create_index('email', unique=True, partialFilterExpression={'email': {'$exists': True}})
            logger.info("Created unique index on users.email")
            
        # anonymous_id 인덱스
        if 'anonymous_id_1' not in user_indexes:
            db.users.create_index('anonymous_id', unique=True, partialFilterExpression={'anonymous_id': {'$exists': True}})
            logger.info("Created unique index on users.anonymous_id")

    except Exception as e:
        logger.error(f"Error creating MongoDB indexes: {str(e)}")

# Utils for authentication
def generate_token(user):
    """사용자 정보로 JWT 토큰 생성"""
    return jwt.encode({
        'id': user.get('id', str(user.get('_id'))),
        'username': user['username'],
        'role': user.get('role', 'user'),
        'exp': datetime.utcnow() + timedelta(seconds=JWT_EXPIRATION)
    }, JWT_SECRET, algorithm='HS256')

def verify_token(token):
    """토큰 검증 및 디코딩"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        return None

def hash_password(password):
    """비밀번호 해싱"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

def check_password(password_hash, password):
    """비밀번호 확인"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash)

# 메모리 DB 관련 함수 삭제
def get_db():
    """현재 상황에 적합한 DB 반환"""
    return mongo.db
