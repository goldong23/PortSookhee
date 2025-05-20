from app import create_app
import os
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('app.main')

# 앱 생성
app = create_app()

# 환경 변수에서 호스트와 포트 읽기 (없으면 기본값 사용)
HOST = os.environ.get('FLASK_HOST', '0.0.0.0')  # 모든 인터페이스에서 접근 가능
PORT = int(os.environ.get('FLASK_PORT', 5000))
DEBUG = os.environ.get('FLASK_ENV') == 'development'

# 시작 로그
logger.info(f"Flask 애플리케이션 시작 준비: 호스트={HOST}, 포트={PORT}, 디버그={DEBUG}")
logger.info(f"FLASK_ENV={os.environ.get('FLASK_ENV', 'production')}")

if __name__ == '__main__':
    logger.info(f"Flask 서버 시작: http://{HOST}:{PORT}/")
    app.run(host=HOST, port=PORT, debug=DEBUG, threaded=True) 