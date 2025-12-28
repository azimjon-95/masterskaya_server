import response from "../utils/response.js";
import { exec } from "child_process";
import { io } from "../config/socket.js"; // Socket.io instance

// ===================== HELPERS =====================
const runADB = (cmd) =>
    new Promise((resolve, reject) => {
        exec(`adb ${cmd}`, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });

const runIOS = (cmd) =>
    new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout.trim());
        });
    });

// ===================== CONTROLLER =====================
class DeviceController {

    // ===================== ANDROID =====================
    async fullInfoAndroid(req, res) {
        try {
            const [device, battery, camera, sensors, storage, cpu, ram, apps, display, network, wifi, bluetooth, log, imei] = await Promise.all([
                runADB("shell getprop"),
                runADB("shell dumpsys battery"),
                runADB("shell dumpsys media.camera"),
                runADB("shell dumpsys sensorservice"),
                runADB("shell df -h"),
                runADB("shell top -n 1 -b"),
                runADB("shell dumpsys meminfo"),
                runADB("shell pm list packages -f"),
                runADB("shell dumpsys display"),
                runADB("shell dumpsys connectivity"),
                runADB("shell dumpsys wifi"),
                runADB("shell dumpsys bluetooth_manager"),
                runADB("logcat -d | tail -n 200"),
                runADB("shell service call iphonesubinfo 1")
            ]);

            const fullData = {
                device,
                battery,
                camera,
                sensors,
                storage,
                cpu,
                ram,
                apps,
                display,
                network,
                wifi,
                bluetooth,
                imei,
                last_logs: log,
                timestamp: new Date().toISOString()
            };

            // Socket orqali hammaga yuborish
            io.emit("android:full-info", fullData);

            // HTTP javob ham qaytarish (agar kerak bo'lsa)
            return response.success(res, "Android full diagnostics received & emitted via socket", fullData);

        } catch (e) {
            io.emit("android:error", { error: e.toString(), timestamp: new Date().toISOString() });
            return response.serverError(res, "Android: Telefon ulanmagan yoki ADB yo'q", e.toString());
        }
    }

    async powerAndroid(req, res) {
        try {
            const [battery, thermal, charging, usbState, current, voltage, capacity] = await Promise.all([
                runADB("shell dumpsys battery"),
                runADB("shell dumpsys thermalservice"),
                runADB("shell dumpsys batteryproperties"),
                runADB("shell getprop sys.usb.state"),
                runADB("shell cat /sys/class/power_supply/battery/current_now"),
                runADB("shell cat /sys/class/power_supply/battery/voltage_now"),
                runADB("shell cat /sys/class/power_supply/battery/capacity")
            ]);

            const powerData = {
                battery,
                usbState,
                thermal,
                charging,
                current_mA: current ? (parseInt(current) / 1000).toFixed(2) + " mA" : "N/A",
                voltage_V: voltage ? (parseInt(voltage) / 1000000).toFixed(2) + " V" : "N/A",
                level_percent: capacity ? capacity + "%" : "N/A",
                timestamp: new Date().toISOString()
            };

            // Real-time socket emit
            io.emit("android:power-live", powerData);

            return response.success(res, "Android power info emitted via socket", powerData);

        } catch (e) {
            io.emit("android:error", { error: e.toString(), timestamp: new Date().toISOString() });
            return response.serverError(res, "Android: Power info olinmadi", e.toString());
        }
    }

    // ===================== IOS =====================
    async deviceInfoIOS(req, res) {
        try {
            const info = await runIOS("ideviceinfo");

            const iosData = {
                info,
                timestamp: new Date().toISOString()
            };

            io.emit("ios:device-info", iosData);

            return response.success(res, "iPhone info emitted via socket", iosData);
        } catch (e) {
            io.emit("ios:error", { error: e.toString(), timestamp: new Date().toISOString() });
            return response.error(res, "iPhone topilmadi yoki libimobiledevice o'rnatilmagan", e.toString());
        }
    }

    async batteryIOS(req, res) {
        try {
            const battery = await runIOS("ideviceinfo -q com.apple.mobile.battery");

            const batteryData = {
                battery,
                timestamp: new Date().toISOString()
            };

            io.emit("ios:battery", batteryData);

            return response.success(res, "iPhone battery info emitted via socket", batteryData);
        } catch (e) {
            io.emit("ios:error", { error: e.toString(), timestamp: new Date().toISOString() });
            return response.error(res, "iPhone battery info olinmadi", e.toString());
        }
    }

    async logsIOS(req, res) {
        try {
            const logs = await runIOS("idevicesyslog | head -n 200");

            const logsData = {
                logs,
                timestamp: new Date().toISOString()
            };

            io.emit("ios:logs", logsData);

            return response.success(res, "iPhone logs emitted via socket", logsData);
        } catch (e) {
            io.emit("ios:error", { error: e.toString(), timestamp: new Date().toISOString() });
            return response.error(res, "iPhone logs olinmadi", e.toString());
        }
    }
}

export default new DeviceController();