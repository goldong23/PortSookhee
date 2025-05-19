import requests
import base64

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

api_key = "YOUR_API_KEY"
url = "https://api.segmind.com/v1/try-on-diffusion"

# Request payload
data = {
  "model_image": image_url_to_base64("https://segmind-sd-models.s3.amazonaws.com/display_images/model.png"),  # Or use image_file_to_base64("IMAGE_PATH")
  "cloth_image": image_url_to_base64("https://segmind-sd-models.s3.amazonaws.com/display_images/cloth.jpg"),  # Or use image_file_to_base64("IMAGE_PATH")
  "category": "Upper body",
  "num_inference_steps": 35,
  "guidance_scale": 2,
  "seed": 12467,
  "base64": False
}

headers = {'x-api-key': api_key}

response = requests.post(url, json=data, headers=headers)
print(response.content)  # The response is the generated image