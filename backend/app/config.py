import os

class Config:
    """기본 환경 설정"""
    MONGO_URI = os.environ.get('MONGODB_URL', 'mongodb://165.229.86.157:8080/')
    MONGODB_DB = os.environ.get('MONGODB_DB', 'PortSookhee')
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default_secret_key_for_development')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET', 'your_jwt_secret_key')
    JWT_EXPIRATION = int(os.environ.get('JWT_EXPIRATION', 86400))  # 24시간 (초)
    DEBUG = False
    TESTING = False

class DevelopmentConfig(Config):
    """개발 환경 설정"""
    DEBUG = True

class TestingConfig(Config):
    """테스트 환경 설정"""
    TESTING = True
    MONGO_URI = "mongodb://localhost:27017/test_db"

class ProductionConfig(Config):
    """운영 환경 설정"""
    # 운영 환경의 안전한 설정
    pass

# 환경별 설정 매핑
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

# 기본 설정 가져오기
def get_config():
    """현재 환경에 맞는 설정 객체 반환"""
    env = os.environ.get('FLASK_ENV', 'development')
    return config_by_name[env] 