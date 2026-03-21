import os
import sys

if getattr(sys, 'frozen', False):
    try:
        import certifi
        cert_path = certifi.where()
        os.environ['SSL_CERT_FILE'] = cert_path
        os.environ['REQUESTS_CA_BUNDLE'] = cert_path
        os.environ['CURL_CA_BUNDLE'] = cert_path
    except Exception:
        pass
