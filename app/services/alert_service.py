"""
Alert service for sending notifications about PPE violations.
Supports Slack webhooks for real-time alerting.
"""
import os
import json
import requests
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class AlertService:
    """Service for sending alerts via Slack webhooks."""
    
    def __init__(self, webhook_url: Optional[str] = None):
        """
        Initialize the alert service.
        
        Args:
            webhook_url: Slack webhook URL. If not provided, reads from SLACK_WEBHOOK_URL env var.
        """
        self.webhook_url = webhook_url or os.getenv("SLACK_WEBHOOK_URL")
        self.enabled = bool(self.webhook_url)
        
        if not self.enabled:
            logger.info("Slack webhook not configured. Alerts will be logged only.")
    
    def send_alert(self, violation_type: str, details: Dict[str, Any]) -> bool:
        """
        Send alert about a PPE violation.
        
        Args:
            violation_type: Type of violation (NO_HELMET, NO_VEST)
            details: Additional details about the violation
        
        Returns:
            True if alert was sent successfully, False otherwise
        """
        severity = "🔴 HIGH" if violation_type == "NO_HELMET" else "🟡 MEDIUM"
        
        message = {
            "text": f"{severity} PPE Violation Detected",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{severity} PPE Violation Detected"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Violation Type:*\n{violation_type.replace('_', ' ').title()}"
                        },
                        {
                            "type": "mrkdwn",
                            "text": f"*Confidence:*\n{details.get('confidence', 0):.2%}"
                        }
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Location:*\nBox: {details.get('box', 'N/A')}"
                    }
                }
            ]
        }
        
        # Log the alert locally
        logger.warning(f"PPE Violation Alert: {violation_type} - {details}")
        
        # Send to Slack if webhook is configured
        if self.enabled:
            try:
                response = requests.post(
                    self.webhook_url,
                    json=message,
                    headers={"Content-Type": "application/json"},
                    timeout=5
                )
                
                if response.status_code == 200:
                    logger.info(f"Slack alert sent successfully for {violation_type}")
                    return True
                else:
                    logger.error(f"Failed to send Slack alert. Status: {response.status_code}")
                    return False
                    
            except Exception as e:
                logger.error(f"Error sending Slack alert: {e}")
                return False
        
        return True  # Return True for local logging even if Slack is disabled
    
    def send_batch_alert(self, violations: list) -> bool:
        """
        Send a batch alert for multiple violations.
        
        Args:
            violations: List of violation dictionaries
        
        Returns:
            True if alert was sent successfully
        """
        if not violations:
            return True
        
        severity_counts = {}
        for v in violations:
            vtype = v["violation_type"]
            severity_counts[vtype] = severity_counts.get(vtype, 0) + 1
        
        summary = ", ".join([f"{count}x {vtype}" for vtype, count in severity_counts.items()])
        
        message = {
            "text": f"🚨 {len(violations)} PPE Violations Detected",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"🚨 {len(violations)} PPE Violations Detected"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Summary:*\n{summary}"
                    }
                }
            ]
        }
        
        logger.warning(f"Batch PPE Violation Alert: {len(violations)} violations - {summary}")
        
        if self.enabled:
            try:
                response = requests.post(
                    self.webhook_url,
                    json=message,
                    headers={"Content-Type": "application/json"},
                    timeout=5
                )
                return response.status_code == 200
            except Exception as e:
                logger.error(f"Error sending batch Slack alert: {e}")
                return False
        
        return True
