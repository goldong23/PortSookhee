# PortSookhee

네트워크 취약점 분석 시스템

## 프로젝트 개요

PortSookhee는 네트워크 취약점 분석을 위한 웹 기반 시스템입니다. 네트워크 토폴로지를 시각화하고, 대상 시스템을 스캔하여 포트, 서비스, OS 정보 및 잠재적 취약점을 탐지합니다.

## 주요 기능

- 네트워크 토폴로지 시각화
- Nmap 기반 네트워크 스캔
  - 빠른 스캔: 일반적인 포트만 빠르게 스캔
  - 전체 스캔: 모든 포트와 OS 정보를 상세하게 스캔
  - 사용자 정의 스캔: 사용자가 지정한 포트와 옵션으로 스캔
- 스캔 결과 시각화 및 분석
- TryHackMe 연동 (OpenVPN 설정)

## 설치 및 실행 방법

### 백엔드 설치

```bash
# 레포지토리 클론
git clone https://github.com/yourusername/PortSookhee.git
cd PortSookhee

# 가상환경 생성 및 활성화
python -m venv backend/venv
source backend/venv/bin/activate  # Windows: backend\venv\Scripts\activate

# 필수 패키지 설치
pip install -r backend/requirements.txt

# Nmap 설치 (시스템 패키지 관리자 사용)
# Ubuntu/Debian: sudo apt-get install nmap
# CentOS/RHEL: sudo yum install nmap
# macOS: brew install nmap
# Windows: https://nmap.org/download.html에서 설치 파일 다운로드

# OpenVPN 설치 (TryHackMe 연동 시 필요)
# Ubuntu/Debian: sudo apt-get install openvpn
# CentOS/RHEL: sudo yum install openvpn
# macOS: brew install openvpn
# Windows: https://openvpn.net/community-downloads/에서 설치 파일 다운로드
```

### 프론트엔드 설치

```bash
# 필수 패키지 설치
cd web-front/my-app
npm install
```

### 환경 변수 설정 (선택사항)

```bash
# 백엔드 환경 변수
export MONGODB_URL="mongodb://your-mongodb-server:27017/PortSookhee"
export JWT_SECRET="your-jwt-secret"
export OPENVPN_CONFIG_DIR="/path/to/vpn/configs"

# 프론트엔드 환경 변수
cd web-front/my-app
echo "REACT_APP_API_URL=http://localhost:5000/api" > .env.local
```

### 실행

```bash
# 백엔드 실행
cd backend
python run.py

# 새 터미널에서 프론트엔드 실행
cd web-front/my-app
npm start
```

## TryHackMe 연동 방법

1. [TryHackMe](https://tryhackme.com/) 계정을 생성합니다.
2. [Access](https://tryhackme.com/access) 페이지에서 운영체제에 맞는 OpenVPN 설정 파일을 다운로드합니다.
3. 시스템에 OpenVPN을 설치합니다.
4. PortSookhee 웹 인터페이스에서 "TryHackMe VPN" 메뉴로 이동합니다.
5. 다운로드한 .ovpn 파일을 업로드합니다.
6. TryHackMe 자격 증명(사용자 이름/비밀번호)을 입력하고 연결합니다.
7. 연결이 완료되면 TryHackMe의 가상 머신에 액세스할 수 있습니다.

## 기술 스택

- 백엔드: Python, Flask, MongoDB
- 프론트엔드: React, TypeScript, Cytoscape.js
- 네트워크 스캔: Nmap
- VPN 연결: OpenVPN

## 라이선스

[적절한 라이선스 정보]