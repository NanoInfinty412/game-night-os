package com.gamenightos.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.Proxy;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Networking helpers: local address discovery, the /health probe and the remembered address. */
final class Net {
    static final int DEFAULT_PORT = 5173;
    static final int[] PORTS = {5173, 3000};

    private static final String PREFS = "game_night";
    private static final String KEY_ADDRESS = "last_address";

    private Net() {}

    /** True when http://address/health answers with a body containing "ok":true. */
    static boolean isGameServer(String address, int connectTimeoutMs, int readTimeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("http://" + address + "/health");
            conn = (HttpURLConnection) url.openConnection(Proxy.NO_PROXY);
            conn.setConnectTimeout(connectTimeoutMs);
            conn.setReadTimeout(readTimeoutMs);
            conn.setUseCaches(false);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() != 200) return false;
            InputStream in = conn.getInputStream();
            byte[] buf = new byte[2048];
            int total = 0;
            int n;
            while (total < buf.length && (n = in.read(buf, total, buf.length - total)) > 0) {
                total += n;
            }
            in.close();
            String body = new String(buf, 0, total, "UTF-8").replaceAll("\\s", "");
            return body.contains("\"ok\":true");
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * The device's private IPv4 addresses, Wi-Fi first, then Ethernet, then anything else.
     * Many TVs are wired, so this does not rely on WifiManager alone.
     */
    static List<String> localIpv4Addresses(Context ctx) {
        List<String> wifi = new ArrayList<>();
        List<String> wired = new ArrayList<>();
        List<String> other = new ArrayList<>();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                String name = nif.getName() == null ? "" : nif.getName().toLowerCase(Locale.ROOT);
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (!(addr instanceof Inet4Address) || !addr.isSiteLocalAddress()) continue;
                    String ip = addr.getHostAddress();
                    if (name.startsWith("wlan") || name.startsWith("wl")) wifi.add(ip);
                    else if (name.startsWith("eth") || name.startsWith("en")) wired.add(ip);
                    else other.add(ip);
                }
            }
        } catch (Exception ignored) {
            // fall through to WifiManager
        }
        String fromWifiManager = wifiManagerIp(ctx);
        Set<String> result = new LinkedHashSet<>();
        if (fromWifiManager != null) result.add(fromWifiManager);
        result.addAll(wifi);
        result.addAll(wired);
        result.addAll(other);
        return new ArrayList<>(result);
    }

    @SuppressWarnings("deprecation")
    private static String wifiManagerIp(Context ctx) {
        try {
            WifiManager wm = (WifiManager) ctx.getApplicationContext()
                    .getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return null;
            WifiInfo info = wm.getConnectionInfo();
            if (info == null) return null;
            int ip = info.getIpAddress();
            if (ip == 0) return null;
            // WifiInfo stores the address little-endian.
            return String.format(Locale.ROOT, "%d.%d.%d.%d",
                    ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff);
        } catch (Exception e) {
            return null;
        }
    }

    /** "192.168.1.42" becomes "192.168.1." */
    static String subnetPrefix(String ip) {
        int dot = ip.lastIndexOf('.');
        return dot < 0 ? null : ip.substring(0, dot + 1);
    }

    /**
     * Cleans up a typed address: drops http://, a trailing /tv or slash, and adds the default
     * port. Returns null when it is not an IPv4 address with an optional port.
     */
    static String normalize(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.startsWith("http://")) s = s.substring(7);
        if (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (s.endsWith("/tv")) s = s.substring(0, s.length() - 3);
        if (s.endsWith(":")) s = s.substring(0, s.length() - 1);
        String host = s;
        int port = DEFAULT_PORT;
        int colon = s.indexOf(':');
        if (colon >= 0) {
            host = s.substring(0, colon);
            try {
                port = Integer.parseInt(s.substring(colon + 1));
            } catch (NumberFormatException e) {
                return null;
            }
            if (port < 1 || port > 65535) return null;
        }
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return null;
        for (String p : parts) {
            if (p.isEmpty() || p.length() > 3) return null;
            int v;
            try {
                v = Integer.parseInt(p);
            } catch (NumberFormatException e) {
                return null;
            }
            if (v < 0 || v > 255) return null;
        }
        return host + ":" + port;
    }

    static String rememberedAddress(Context ctx) {
        return prefs(ctx).getString(KEY_ADDRESS, null);
    }

    static void rememberAddress(Context ctx, String address) {
        prefs(ctx).edit().putString(KEY_ADDRESS, address).apply();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
