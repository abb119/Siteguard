import streamlit as st
import requests
from PIL import Image
import io
import json

# Configuration
API_URL = "http://api:8000/detect" # Use 'api' hostname for Docker, or 'localhost' for local dev if running outside docker
# For local testing outside docker, we might need to override this or use localhost
# But since we are designing for docker-compose, 'api' is the service name.
# However, if running streamlit locally and api locally, it should be localhost.
# Let's make it configurable or default to localhost for now since we are verifying locally first.
API_URL = "http://127.0.0.1:8000/detect"

st.set_page_config(page_title="SiteGuard Dashboard", layout="wide")

st.title("👷 SiteGuard: PPE Detection & Compliance")
st.markdown("Real-time monitoring of Personal Protective Equipment (Helmet & Vest).")

# Sidebar for configuration
st.sidebar.header("Configuration")
api_endpoint = st.sidebar.text_input("API Endpoint", API_URL)

uploaded_file = st.sidebar.file_uploader("Upload an image", type=["jpg", "jpeg", "png"])

if uploaded_file is not None:
    # Display original image
    image = Image.open(uploaded_file)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Original Image")
        st.image(image, use_column_width=True)

    # Send to API
    if st.sidebar.button("Analyze Compliance"):
        with st.spinner("Analyzing image..."):
            try:
                # Prepare file for upload
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format=image.format)
                img_byte_arr.seek(0)
                
                files = {"file": ("image.jpg", img_byte_arr, "image/jpeg")}
                response = requests.post(api_endpoint, files=files)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Draw bounding boxes
                    from PIL import ImageDraw
                    draw = ImageDraw.Draw(image)
                    
                    detections = data.get("detections", [])
                    violations = data.get("violations", [])
                    
                    # Helper to check if a box is a violation
                    def get_violation_info(box, violations):
                        for v in violations:
                            # Simple check: if box matches violation details
                            # In a real app, we'd use IDs, but here we use box coords equality or proximity
                            v_box = v['details']['person_box']
                            if box == v_box:
                                return v
                        return None

                    for det in detections:
                        box = det["box"]
                        cls_name = det["class_name"]
                        conf = det["confidence"]
                        
                        color = "green"
                        label = f"{cls_name} {conf:.2f}"
                        
                        # If it's a person, check for violations
                        if cls_name == "person":
                            violation = get_violation_info(box, violations)
                            if violation:
                                color = "red"
                                label += f" [{violation['violation_type']}]"
                        
                        draw.rectangle(box, outline=color, width=3)
                        draw.text((box[0], box[1] - 10), label, fill=color)
                    
                    with col2:
                        st.subheader("Analyzed Image")
                        st.image(image, use_column_width=True)
                        
                    # Display Alerts
                    st.subheader("Compliance Report")
                    if data["compliant"]:
                        st.success("✅ Compliant: All workers are wearing required PPE.")
                    else:
                        st.error(f"❌ Non-Compliant: {len(violations)} violations detected.")
                        for v in violations:
                            st.warning(f"**{v['violation_type']}** (Severity: {v['severity']})")
                            
                    with st.expander("Raw API Response"):
                        st.json(data)
                        
                else:
                    st.error(f"Error: API returned status code {response.status_code}")
                    st.text(response.text)
                    
            except Exception as e:
                st.error(f"Connection Error: {e}")
