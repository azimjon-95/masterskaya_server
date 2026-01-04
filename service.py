# get_device_info.py
from ppadb.client import Client as AdbClient
import json

client = AdbClient(host="127.0.0.1", port=5037)

devices = client.devices()
result = {}

if len(devices) == 0:
    result["success"] = False
    result["message"] = "Telefon topilmadi"
else:
    device = devices[0]
    props = device.get_properties()
    result["success"] = True
    result["device"] = props

print(json.dumps(result))
