from flask import Blueprint, request, jsonify
import logging
import requests
import base64

# 블루프린트 생성
virtual_fit_bp = Blueprint('virtual_fit', __name__)
logger = logging.getLogger('app.virtual_fit')

# Use this function to convert an image file from the filesystem to base64
def image_file_to_base64(image_path):
    with open(image_path, 'rb') as f:
        image_data = f.read()
    return base64.b64encode(image_data).decode('utf-8')

# Use this function to fetch an image from a URL and convert it to base64
def image_url_to_base64(image_url):
    response = requests.get(image_url)
    image_data = response.content
    return base64.b64encode(image_data).decode('utf-8')

# Use this function to convert a list of image URLs to base64
def image_urls_to_base64(image_urls):
    return [image_url_to_base64(url) for url in image_urls]

@virtual_fit_bp.route('/try-on', methods=['POST'])
def try_on():
    try:
        logger.info("가상 피팅 API 요청 수신")
        # 요청에서 필요한 파라미터 추출
        request_data = request.json
        api_key = request_data.get('api_key', '')
        model_image_url = request_data.get('model_image', 'https://segmind-sd-models.s3.amazonaws.com/display_images/model.png')
        cloth_image_url = request_data.get('cloth_image', 'https://segmind-sd-models.s3.amazonaws.com/display_images/cloth.jpg')
        category = request_data.get('category', 'Upper body')
        num_inference_steps = request_data.get('num_inference_steps', 35)
        guidance_scale = request_data.get('guidance_scale', 2)
        seed = request_data.get('seed', 12467)
        
        logger.debug(f"모델 이미지 URL: {model_image_url}")
        logger.debug(f"의류 이미지 URL: {cloth_image_url}")
        logger.debug(f"카테고리: {category}")
        
        # API 요청 준비
        url = "https://api.segmind.com/v1/try-on-diffusion"

        # Request payload
        data = {
            "model_image": image_url_to_base64(model_image_url),
            "cloth_image": image_url_to_base64(cloth_image_url),
            "category": category,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "seed": seed,
            "base64": True  # 응답을 base64로 받기
        }

        headers = {'x-api-key': api_key}
        
        logger.info("Segmind API 호출 중...")
        # API 호출
        response = requests.post(url, json=data, headers=headers)
        
        # 결과 반환
        if response.status_code == 200:
            logger.info("Segmind API 호출 성공")
            return jsonify({"success": True, "data": response.json()})
        else:
            logger.error(f"Segmind API 호출 실패: {response.status_code}, {response.text}")
            return jsonify({
                "success": False, 
                "error": f"API 요청 실패: {response.status_code}", 
                "message": response.text
            }), 500
            
    except Exception as e:
        logger.error(f"가상 피팅 처리 중 오류 발생: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@virtual_fit_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "virtual-fit-api"})