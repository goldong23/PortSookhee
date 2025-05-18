# PortSookhee 백엔드 API

Flask와 MongoDB를 사용하는 PortSookhee 프로젝트의 백엔드 API 서버입니다.

## 프로젝트 구조

```
backend/
├── app/                 # 애플리케이션 패키지
│   ├── __init__.py      # 앱 팩토리 패턴 구현
│   ├── config.py        # 설정 클래스
│   └── routes/          # 라우트 모듈
│       ├── __init__.py
│       ├── auth.py      # 인증 관련 라우트
│       └── main.py      # 기본 라우트
├── app.py               # Flask 애플리케이션 진입점
├── run.py               # 편리한 실행 스크립트
└── requirements.txt     # 의존성 목록
```

## 설치 방법

1. Python 3.7 이상이 필요합니다
2. 가상환경 생성 및 활성화:
   ```
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```
3. 의존성 설치:
   ```
   pip install -r requirements.txt
   ```

## 실행 방법

다음 명령어로 서버를 실행할 수 있습니다:

```bash
# 방법 1: Flask CLI 사용
flask run

# 방법 2: 실행 스크립트 사용
python run.py

# 디버그 모드로 실행
python run.py --debug
```

기본적으로 서버는 http://127.0.0.1:5000 에서 실행됩니다.

## API 엔드포인트

### 인증 관련 (Auth)

- `POST /api/auth/register` - 사용자 등록
- `POST /api/auth/login` - 사용자 로그인
- `POST /api/auth/anonymous` - 비회원 로그인

### 기타

- `GET /api` - API 상태 확인
- `GET /api/scan/<ip_address>` - 지정된 IP 주소의 포트 스캔

## 개발 환경 설정

환경 변수를 통해 여러 설정을 변경할 수 있습니다:

- `FLASK_ENV`: 실행 환경 (development, testing, production)
- `FLASK_HOST`: 호스트 주소 (기본값: 127.0.0.1)
- `FLASK_PORT`: 포트 번호 (기본값: 5000)
- `MONGODB_URL`: MongoDB 연결 URL (기본값: mongodb://165.229.86.157:8080/)
- `MONGODB_DB`: MongoDB 데이터베이스 이름 (기본값: PortSookhee)
- `JWT_SECRET`: JWT 토큰 암호화 키 