# scan.py
import nmap
import re
import json
import time
from typing import Dict, List, Any, Optional, Union, Tuple
import ipaddress
import socket
import threading
import logging

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

class ScanStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

# 스캔 작업을 추적하기 위한 전역 딕셔너리
scan_tasks = {}

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
        raise

def full_scan(target: str) -> Dict:
    """
    전체 스캔: 모든 포트와 OS 정보를 자세하게 스캔합니다. (시간 소요)
    """
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
        raise

def custom_scan(target: str, ports: str = None, arguments: str = None) -> Dict:
    """
    사용자 정의 스캔: 사용자가 지정한 포트와 옵션으로 스캔합니다.
    """
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
        raise

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
        # 스캔 시작
        start_scan_task(scan_id, ScanMode.QUICK, target)
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