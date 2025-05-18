from flask import Blueprint, jsonify, g
import logging
import nmap

main_bp = Blueprint('main', __name__)
logger = logging.getLogger('app.main')

@main_bp.route('/')
def home():
    """API 루트 경로"""
    return jsonify({
        'status': 'online', 
        'message': 'PortSookhee API is running!',
        'db_status': 'connected'
    })

@main_bp.route('/scan/<ip_address>')
def scan_ports(ip_address):
    """지정된 IP 주소의 포트 스캔"""
    try:
        nm = nmap.PortScanner()
        result = nm.scan(ip_address, '22-443')
        return jsonify({
            'ip_address': ip_address,
            'scan_results': result
        })
    except Exception as e:
        logger.error(f"Scan error: {str(e)}")
        return jsonify({
            'error': 'Scan failed',
            'message': str(e)
        }), 500 