import requests
import sys
import time

def test_metrics():
    url = "http://127.0.0.1:8000/metrics"
    
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            if "http_requests_total" in response.text:
                print("SUCCESS: Metrics found")
            else:
                print("FAILURE: Metrics endpoint returned 200 but no expected metrics found")
                sys.exit(1)
        else:
            print("FAILURE: Metrics endpoint returned error")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_metrics()
