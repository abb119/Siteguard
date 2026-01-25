import sys
import os
from fastapi import FastAPI
from fastapi.routing import APIRoute, APIWebSocketRoute

# Add project root to path
sys.path.append(os.getcwd())

try:
    from app.app.main import app
    print("Successfully imported app")
    
    print("\n--- Registered Routes ---")
    found_ws = False
    for route in app.routes:
        if isinstance(route, APIWebSocketRoute):
            print(f"WEBSOCKET: {route.path}")
            if route.path == "/ws/ppe-stream":
                found_ws = True
        elif isinstance(route, APIRoute):
            print(f"HTTP: {route.path} {route.methods}")
            
    if found_ws:
        print("\nSUCCESS: /ws/ppe-stream is registered.")
    else:
        print("\nFAILURE: /ws/ppe-stream is NOT registered.")

except Exception as e:
    print(f"\nCRITICAL ERROR IMPORTING APP: {e}")
    import traceback
    traceback.print_exc()
