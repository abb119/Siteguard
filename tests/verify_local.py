import requests
import io
from PIL import Image
import sys

def create_dummy_image():
    img = Image.new('RGB', (100, 100), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    return img_byte_arr

def test_api():
    url = "http://127.0.0.1:8000/detect"
    image = create_dummy_image()
    files = {'file': ('test.jpg', image, 'image/jpeg')}
    
    try:
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            data = response.json()
            print("SUCCESS: API returned 200")
            print(f"Detections: {len(data['detections'])}")
            print(f"Violations: {len(data['violations'])}")
            print(f"Compliant: {data['compliant']}")
            if data['violations']:
                print("Violations found:", data['violations'])
        else:
            print("FAILURE: API returned error")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_api()
