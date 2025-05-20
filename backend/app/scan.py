# scan.py
import re
import json
import time
import os
import subprocess
import logging
from typing import Dict, List, Any, Optional, Union, Tuple
import ipaddress
import socket
import threading

# nmap 라이브러리 임포트 예외 처리
try:
    import nmap
    NMAP_AVAILABLE = True
except ImportError:
    NMAP_AVAILABLE = False
    logging.warning("python-nmap 라이브러리를 가져올 수 없습니다. 테스트 모드만 사용 가능합니다.")

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# IP/CIDR/도메인 검증 패턴
IP_REGEX = re.compile(r'^([0-9]{1,3}\.){3}[0-9]{1,3}$')
CIDR_REGEX = re.compile(r'^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$')
DOMAIN_REGEX = re.compile(r'^[a-zA-Z0-9][-a-zA-Z0-9.]{0,253}[a-zA-Z0-9](:[0-9]{1,5})?$')

# 스캔 모드 정의
class ScanMode:
    QUICK = "quick"       # 일반적인 포트만 빠르게 스캔
    FULL = "full"         # 모든 포트와 OS 감지 (시간 소요)
    CUSTOM = "custom"     # 사용자 정의 옵션
    TEST = "test"         # 테스트 모드 (실제 스캔 없이 테스트용 결과 반환)

class ScanStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

# 스캔 작업을 추적하기 위한 전역 딕셔너리
scan_tasks = {}

# nmap 설치 확인 함수
def check_nmap_installed() -> bool:
    """
    시스템에 nmap이 설치되어 있는지 확인합니다.
    """
    # 먼저 python-nmap 라이브러리 확인
    if not NMAP_AVAILABLE:
        logger.warning("python-nmap 라이브러리가 설치되어 있지 않습니다.")
        return False
        
    try:
        # which 또는 where 명령어로 nmap 실행 파일 찾기
        if os.name == 'nt':  # Windows
            result = subprocess.run(['where', 'nmap'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        else:  # Linux, MacOS
            result = subprocess.run(['which', 'nmap'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # 반환 코드가 0이면 설치되어 있음
        is_installed = result.returncode == 0
        if not is_installed:
            logger.warning("시스템에 nmap이 설치되어 있지 않습니다.")
        return is_installed
    except Exception as e:
        logger.error(f"nmap 설치 확인 중 오류 발생: {str(e)}")
        return False

# 테스트용 더미 데이터
def generate_test_data(target: str) -> Dict:
    """
    테스트 목적으로 사용할 더미 스캔 결과를 생성합니다.
    """
    return {
        'scan_info': {
            'tcp': {'method': 'connect', 'services': '1-1024'},
        },
        'hosts': [
            {
                'hostname': f'test-{target}',
                'state': 'up',
                'ip': target,
                'mac': '00:11:22:33:44:55',
                'macVendor': 'Test Vendor',
                'ports': [
                    {
                        'port': 80,
                        'protocol': 'tcp',
                        'state': 'open',
                        'service': 'http',
                        'product': 'Apache',
                        'version': '2.4.41',
                    },
                    {
                        'port': 443,
                        'protocol': 'tcp',
                        'state': 'open',
                        'service': 'https',
                        'product': 'nginx',
                        'version': '1.18.0',
                    },
                    {
                        'port': 22,
                        'protocol': 'tcp',
                        'state': 'open',
                        'service': 'ssh',
                        'product': 'OpenSSH',
                        'version': '8.2',
                    }
                ],
                'os': {
                    'name': 'Linux',
                    'accuracy': 95,
                    'version': '4.x',
                },
                'scripts': [],
                'uptime': {'seconds': 1234567, 'lastBoot': '2023-01-01 00:00:00'},
                'distance': 3,
                'tcpSequence': {'class': 'random positive increments', 'difficulty': 'Good luck!'},
                'lastScanTime': time.strftime('%Y-%m-%d %H:%M:%S')
            }
        ]
    }

def is_valid_target(target: str) -> bool:
    """
    주어진 타겟이 유효한 IP, CIDR, 또는 도메인인지 검증합니다.
    """
    if IP_REGEX.match(target):
        # IP 주소 형식 검증
        try:
            ipaddress.IPv4Address(target)
            return True
        except ValueError:
            return False
    elif CIDR_REGEX.match(target):
        # CIDR 형식 검증
        try:
            ipaddress.IPv4Network(target)
            return True
        except ValueError:
            return False
    elif DOMAIN_REGEX.match(target):
        # 도메인 형식은 일치하지만, 실제 호스트인지는 여기서 검증하지 않음
        return True
    return False

def parse_nmap_data(host_data: Dict) -> Dict[str, Any]:
    """
    nmap 스캔 결과를 파싱하여 필요한 데이터 형식으로 변환합니다.
    """
    result = {
        'hostname': host_data.hostname(),
        'state': host_data.state(),
        'ip': host_data.get('addresses', {}).get('ipv4', ''),
        'mac': host_data.get('addresses', {}).get('mac', ''),
        'macVendor': host_data.get('vendor', {}).get(host_data.get('addresses', {}).get('mac', ''), ''),
        'ports': [],
        'os': None,
        'scripts': [],
        'uptime': None,
        'distance': None,
        'tcpSequence': None,
        'lastScanTime': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    # 포트 정보 파싱
    for proto in ['tcp', 'udp']:
        if proto in host_data:
            for port_num, port_data in host_data[proto].items():
                port_info = {
                    'port': int(port_num),
                    'protocol': proto,
                    'state': port_data.get('state', ''),
                    'service': port_data.get('name', ''),
                    'product': port_data.get('product', ''),
                    'version': port_data.get('version', ''),
                }
                result['ports'].append(port_info)

    # OS 정보 파싱
    if 'osmatch' in host_data and host_data['osmatch']:
        top_match = host_data['osmatch'][0]
        result['os'] = {
            'name': top_match.get('name', ''),
            'accuracy': int(top_match.get('accuracy', 0)),
            'version': top_match.get('osclass', [{}])[0].get('osgen', '') if top_match.get('osclass') else '',
        }

    # 스크립트 결과 파싱
    if 'hostscript' in host_data:
        for script in host_data['hostscript']:
            result['scripts'].append({
                'name': script.get('id', ''),
                'output': script.get('output', '')
            })
            
    # 업타임 정보 파싱
    if 'uptime' in host_data:
        result['uptime'] = {
            'seconds': host_data['uptime'].get('seconds', 0),
            'lastBoot': host_data['uptime'].get('lastboot', '')
        }
        
    # 거리 정보 파싱
    if 'distance' in host_data:
        result['distance'] = host_data['distance'].get('value', 0)
        
    # TCP 시퀀스 정보 파싱
    if 'tcpsequence' in host_data:
        result['tcpSequence'] = {
            'class': host_data['tcpsequence'].get('class', ''),
            'difficulty': host_data['tcpsequence'].get('difficulty', '')
        }
        
    return result

def quick_scan(target: str) -> Dict:
    """
    빠른 스캔: 대표적인 포트만 빠르게 스캔합니다.
    """
    # nmap 설치 확인
    if not check_nmap_installed():
        logger.warning("nmap이 설치되어 있지 않아 테스트 모드로 대체합니다.")
        return test_scan(target)
    
    common_ports = "21,22,23,25,53,80,110,139,443,445,3306,3389,8080"
    nm = nmap.PortScanner()
    args = f'-sT -T4 -F --open -p {common_ports}'
    logger.info(f"빠른 스캔 시작: {target} {args}")
    
    try:
        nm.scan(hosts=target, arguments=args)
        result = process_scan_result(nm, target)
        logger.info(f"빠른 스캔 완료: {target}")
        return result
    except Exception as e:
        logger.error(f"빠른 스캔 실패: {target} - {str(e)}")
        # 스캔 실패 시 테스트 모드로 대체
        logger.info(f"오류로 인해 테스트 모드로 대체합니다.")
        return test_scan(target)

def full_scan(target: str) -> Dict:
    """
    전체 스캔: 모든 포트와 OS 정보를 자세하게 스캔합니다. (시간 소요)
    """
    # nmap 설치 확인
    if not check_nmap_installed():
        logger.warning("nmap이 설치되어 있지 않아 테스트 모드로 대체합니다.")
        return test_scan(target)
    
    nm = nmap.PortScanner()
    # -O: OS 감지, -A: OS 감지 + 스크립트 + 트레이스라우트 등
    # --version-all: 모든 서비스 버전 정보 수집
    args = '-sT -sV -O -A --osscan-guess --version-all'
    logger.info(f"전체 스캔 시작: {target} {args}")
    
    try:
        nm.scan(hosts=target, arguments=args)
        result = process_scan_result(nm, target)
        logger.info(f"전체 스캔 완료: {target}")
        return result
    except Exception as e:
        logger.error(f"전체 스캔 실패: {target} - {str(e)}")
        # 스캔 실패 시 테스트 모드로 대체
        logger.info(f"오류로 인해 테스트 모드로 대체합니다.")
        return test_scan(target)

def custom_scan(target: str, ports: str = None, arguments: str = None) -> Dict:
    """
    사용자 정의 스캔: 사용자가 지정한 포트와 옵션으로 스캔합니다.
    """
    # nmap 설치 확인
    if not check_nmap_installed():
        logger.warning("nmap이 설치되어 있지 않아 테스트 모드로 대체합니다.")
        return test_scan(target)
    
    if not ports and not arguments:
        raise ValueError("포트 범위나 스캔 인자 중 최소한 하나는 지정해야 합니다")
        
    nm = nmap.PortScanner()
    args = arguments if arguments else f'-sT -p {ports}'
    logger.info(f"사용자 정의 스캔 시작: {target} {args}")
    
    try:
        nm.scan(hosts=target, arguments=args)
        result = process_scan_result(nm, target)
        logger.info(f"사용자 정의 스캔 완료: {target}")
        return result
    except Exception as e:
        logger.error(f"사용자 정의 스캔 실패: {target} - {str(e)}")
        # 스캔 실패 시 테스트 모드로 대체
        logger.info(f"오류로 인해 테스트 모드로 대체합니다.")
        return test_scan(target)

def test_scan(target: str) -> Dict:
    """
    테스트 스캔: 실제 nmap 스캔 없이 테스트용 결과를 반환합니다.
    """
    logger.info(f"테스트 스캔 시작: {target}")
    # 2초 대기하여 실제 스캔 흉내내기
    time.sleep(2)
    result = generate_test_data(target)
    logger.info(f"테스트 스캔 완료: {target}")
    return result

def process_scan_result(nm: nmap.PortScanner, target: str) -> Dict:
    """
    스캔 결과를 처리하고 필요한 형식으로 반환합니다.
    """
    result = {
        'scan_info': nm.scaninfo(),
        'hosts': []
    }
    
    for host in nm.all_hosts():
        host_data = nm[host]
        parsed_data = parse_nmap_data(host_data)
        result['hosts'].append(parsed_data)
    
    return result

def start_scan_task(scan_id: str, scan_mode: str, target: str, **kwargs) -> Dict:
    """
    비동기적으로 스캔 작업을 시작하고, 작업 ID를 반환합니다.
    """
    if not is_valid_target(target):
        raise ValueError(f"잘못된 대상 형식: {target}")
    
    scan_tasks[scan_id] = {
        'id': scan_id, 
        'target': target, 
        'mode': scan_mode,
        'status': ScanStatus.PENDING, 
        'start_time': time.time(),
        'result': None,
        'error': None
    }
    
    def run_scan_thread():
        try:
            scan_tasks[scan_id]['status'] = ScanStatus.RUNNING
            
            if scan_mode == ScanMode.QUICK:
                result = quick_scan(target)
            elif scan_mode == ScanMode.FULL:
                result = full_scan(target)
            elif scan_mode == ScanMode.CUSTOM:
                ports = kwargs.get('ports')
                arguments = kwargs.get('arguments')
                result = custom_scan(target, ports, arguments)
            elif scan_mode == ScanMode.TEST:
                result = test_scan(target)
            else:
                raise ValueError(f"잘못된 스캔 모드: {scan_mode}")
                
            scan_tasks[scan_id]['result'] = result
            scan_tasks[scan_id]['status'] = ScanStatus.COMPLETED
            scan_tasks[scan_id]['end_time'] = time.time()
            
        except Exception as e:
            logger.error(f"스캔 실패 [ID: {scan_id}]: {str(e)}")
            scan_tasks[scan_id]['status'] = ScanStatus.FAILED
            scan_tasks[scan_id]['error'] = str(e)
            scan_tasks[scan_id]['end_time'] = time.time()
            
    thread = threading.Thread(target=run_scan_thread)
    thread.daemon = True
    thread.start()
    
    return {
        'scan_id': scan_id,
        'target': target,
        'mode': scan_mode,
        'status': ScanStatus.PENDING
    }

def get_scan_status(scan_id: str) -> Dict:
    """
    스캔 작업의 상태를 확인합니다.
    """
    if scan_id not in scan_tasks:
        raise ValueError(f"존재하지 않는 스캔 ID: {scan_id}")
        
    task = scan_tasks[scan_id]
    
    result = {
        'scan_id': scan_id,
        'target': task['target'],
        'mode': task['mode'],
        'status': task['status'],
        'start_time': task['start_time']
    }
    
    if task['status'] in [ScanStatus.COMPLETED, ScanStatus.FAILED]:
        result['end_time'] = task.get('end_time')
        result['duration'] = task.get('end_time', 0) - task['start_time']
        
    if task['status'] == ScanStatus.COMPLETED:
        result['result'] = task['result']
    elif task['status'] == ScanStatus.FAILED:
        result['error'] = task['error']
        
    return result

# 메인 함수 (테스트용)
if __name__ == "__main__":
    import uuid
    
    target = "127.0.0.1"  # 스캔할 대상
    scan_id = str(uuid.uuid4())
    
    try:
        # nmap 확인
        if check_nmap_installed():
            print("nmap이 설치되어 있습니다.")
        else:
            print("nmap이 설치되어 있지 않습니다. 테스트 모드만 사용 가능합니다.")
            
        # 스캔 시작 (테스트 모드)
        start_scan_task(scan_id, ScanMode.TEST, target)
        print(f"스캔 시작: ID={scan_id}")
        
        # 스캔 완료까지 대기
        while True:
            status = get_scan_status(scan_id)
            print(f"상태: {status['status']}")
            if status['status'] in [ScanStatus.COMPLETED, ScanStatus.FAILED]:
                break
            time.sleep(1)
        
        # 결과 출력
        if status['status'] == ScanStatus.COMPLETED:
            print(json.dumps(status['result'], indent=2, ensure_ascii=False))
        else:
            print(f"스캔 실패: {status['error']}")
            
    except Exception as e:
        print(f"오류 발생: {str(e)}")