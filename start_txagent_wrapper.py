#!/usr/bin/env python3
"""
Startup script for TxAgent Assistant Wrapper
This script ensures proper environment setup and starts the FastAPI service
"""

import sys
import os
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_requirements():
    """Check if required packages are installed"""
    required_packages = [
        'fastapi',
        'uvicorn',
        'pydantic',
        'transformers'
    ]
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
            logger.info(f"✓ {package} is installed")
        except ImportError:
            missing_packages.append(package)
            logger.warning(f"✗ {package} is not installed")
    
    if missing_packages:
        logger.error("Missing required packages. Install them with:")
        logger.error(f"pip install {' '.join(missing_packages)}")
        return False
    
    return True

def check_txagent_files():
    """Check if TxAgent files are available"""
    current_dir = Path(__file__).parent
    required_files = [
        'txagent_assistant_wrapper.py',
        'working_drug_agent.py'  # Optional, will use fallback if missing
    ]
    
    missing_files = []
    for file in required_files:
        file_path = current_dir / file
        if file_path.exists():
            logger.info(f"✓ {file} found")
        else:
            if file == 'working_drug_agent.py':
                logger.warning(f"⚠ {file} not found - will use basic fallback")
            else:
                missing_files.append(file)
                logger.error(f"✗ {file} not found")
    
    if missing_files:
        return False
    
    return True

def start_service():
    """Start the TxAgent wrapper service"""
    try:
        logger.info("Starting TxAgent Assistant Wrapper service...")
        logger.info("Service will be available at: http://localhost:8001")
        logger.info("Health check endpoint: http://localhost:8001/health")
        logger.info("OpenAI-compatible endpoint: http://localhost:8001/openai-assistant")
        logger.info("\nPress Ctrl+C to stop the service\n")
        
        # Start the FastAPI service with uvicorn
        subprocess.run([
            sys.executable, "-m", "uvicorn",
            "txagent_assistant_wrapper:app",
            "--host", "0.0.0.0",
            "--port", "8001"
        ])
        
    except KeyboardInterrupt:
        logger.info("\nService stopped by user")
    except Exception as e:
        logger.error(f"Error starting service: {e}")

def main():
    """Main startup function"""
    logger.info("TxAgent Assistant Wrapper - Startup Script")
    logger.info("=" * 50)
    
    # Check requirements
    logger.info("Checking requirements...")
    if not check_requirements():
        logger.error("Please install missing packages and try again")
        sys.exit(1)
    
    # Check TxAgent files
    logger.info("Checking TxAgent files...")
    if not check_txagent_files():
        logger.error("Please ensure required files are present")
        sys.exit(1)
    
    # Start service
    logger.info("All checks passed! Starting service...")
    start_service()

if __name__ == "__main__":
    main() 