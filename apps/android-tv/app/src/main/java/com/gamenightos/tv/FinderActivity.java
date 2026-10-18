package com.gamenightos.tv;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Start screen: looks for the game computer on the local network (GET /health on ports 5173
 * and 3000 across the /24 subnet), lists what it finds as big buttons, and offers an on-screen
 * keypad for typing the address by hand.
 */
public class FinderActivity extends Activity {
    /** Set when the player asked to change computer: skip the auto-jump to the remembered one. */
    static final String EXTRA_NO_AUTO = "no_auto";

    private static final int SCAN_THREADS = 32;
    private static final int SCAN_CONNECT_MS = 400;
    private static final int SCAN_READ_MS = 800;
    private static final int MAX_SUBNETS = 3;

    private TextView status;
    private TextView hint;
    private LinearLayout results;
    private View listScreen;
    private View keypadScreen;
    private TextView keypadDisplay;
    private TextView keypadMessage;
    private TextView typeButton;
    private TextView searchButton;
    private View firstKey;

    private final StringBuilder typed = new StringBuilder();
    private final Set<String> found = new LinkedHashSet<>();
    private ExecutorService scanPool;
    private int scanGeneration = 0;
    private int shownProgress = 0;
    private boolean destroyed = false;
    private String subnetHint = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.NIGHT);
        listScreen = buildListScreen();
        keypadScreen = buildKeypadScreen();
        keypadScreen.setVisibility(View.GONE);
        root.addView(listScreen, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(keypadScreen, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        List<String> ips = Net.localIpv4Addresses(this);
        if (!ips.isEmpty()) subnetHint = Net.subnetPrefix(ips.get(0));

        boolean noAuto = getIntent() != null && getIntent().getBooleanExtra(EXTRA_NO_AUTO, false);
        String remembered = Net.rememberedAddress(this);
        if (!noAuto && remembered != null) {
            tryRemembered(remembered);
        } else {
            startScan();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showList();
        startScan();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        stopScan();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- list screen

    private View buildListScreen() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(Ui.dp(this, 48), Ui.dp(this, 28), Ui.dp(this, 48), Ui.dp(this, 24));

        TextView title = Ui.text(this, "Game Night", 44, Ui.PINK, true);
        title.setGravity(Gravity.CENTER);
        col.addView(title, wrap());

        status = Ui.text(this, "Finding your game computer…", 26, Ui.YELLOW, true);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, Ui.dp(this, 6), 0, 0);
        col.addView(status, wrap());

        hint = Ui.text(this, "", 17, Ui.TEXT_SOFT, false);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 10));
        col.addView(hint, wrap());

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.setClipToPadding(false);
        scroll.setClipChildren(false);
        results = new LinearLayout(this);
        results.setOrientation(LinearLayout.VERTICAL);
        results.setGravity(Gravity.CENTER_HORIZONTAL);
        results.setClipChildren(false);
        results.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        scroll.addView(results, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        col.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setPadding(0, Ui.dp(this, 12), 0, 0);
        typeButton = Ui.button(this, "Type the address", 22, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showKeypad();
            }
        });
        searchButton = Ui.button(this, "Search again", 22, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startScan();
            }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(Ui.dp(this, 14), 0, Ui.dp(this, 14), 0);
        row.addView(typeButton, lp);
        row.addView(searchButton, new LinearLayout.LayoutParams(lp));
        col.addView(row, wrap());
        return col;
    }

    private void tryRemembered(final String address) {
        status.setText("Checking " + address + "…");
        hint.setText("That's the computer you played on last time.");
        searchButton.requestFocus();
        final int generation = ++scanGeneration;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean ok = Net.isGameServer(address, 1500, 2000);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (destroyed || generation != scanGeneration) return;
                        if (ok) openGame(address);
                        else startScan();
                    }
                });
            }
        }).start();
    }

    private void startScan() {
        stopScan();
        final int generation = ++scanGeneration;
        found.clear();
        shownProgress = 0;
        results.removeAllViews();

        List<String> ips = Net.localIpv4Addresses(this);
        List<String> prefixes = new ArrayList<>();
        for (String ip : ips) {
            String prefix = Net.subnetPrefix(ip);
            if (prefix != null && !prefixes.contains(prefix)) prefixes.add(prefix);
            if (prefixes.size() >= MAX_SUBNETS) break;
        }
        if (prefixes.isEmpty()) {
            status.setText("The TV isn't on a network yet");
            hint.setText("Connect the TV to your home Wi-Fi, then press Search again.\n"
                    + "Or type the address shown on your computer.");
            if (!typeButton.hasFocus()) searchButton.requestFocus();
            return;
        }
        subnetHint = prefixes.get(0);

        status.setText("Finding your game computer…");
        hint.setText("Looking around " + prefixes.get(0) + "x on ports 5173 and 3000");
        if (!typeButton.hasFocus()) searchButton.requestFocus();

        final int total = prefixes.size() * 254 * Net.PORTS.length;
        final AtomicInteger done = new AtomicInteger();
        scanPool = Executors.newFixedThreadPool(SCAN_THREADS);
        // Port 5173 first for every host, then 3000, so dev servers show up quickly.
        for (final int port : Net.PORTS) {
            for (String prefix : prefixes) {
                for (int host = 1; host <= 254; host++) {
                    final String address = prefix + host + ":" + port;
                    scanPool.execute(new Runnable() {
                        @Override
                        public void run() {
                            final boolean ok = Net.isGameServer(address, SCAN_CONNECT_MS, SCAN_READ_MS);
                            final int count = done.incrementAndGet();
                            if (!ok && count % 16 != 0 && count != total) return;
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (destroyed || generation != scanGeneration) return;
                                    if (ok) addFound(address);
                                    updateProgress(count, total);
                                }
                            });
                        }
                    });
                }
            }
        }
        scanPool.shutdown();
    }

    private void stopScan() {
        if (scanPool != null) {
            scanPool.shutdownNow();
            scanPool = null;
        }
    }

    private void updateProgress(int count, int total) {
        // Progress posts from worker threads can arrive out of order; never go backwards.
        if (count <= shownProgress) return;
        shownProgress = count;
        if (count < total) {
            int pct = Math.round(count * 100f / total);
            if (found.isEmpty()) {
                status.setText(String.format(Locale.ROOT, "Finding your game computer… %d%%", pct));
            } else {
                status.setText(String.format(Locale.ROOT, "Pick your game computer (still looking… %d%%)", pct));
            }
            return;
        }
        if (found.isEmpty()) {
            status.setText("No game computer found yet");
            hint.setText("Start the game on your computer (pnpm dev or pnpm start),\n"
                    + "check it's on the same Wi-Fi as the TV, then Search again.");
        } else {
            status.setText(found.size() == 1 ? "Found your game computer!" : "Pick your game computer");
            hint.setText("Press OK to start playing.");
        }
    }

    private void addFound(final String address) {
        if (!found.add(address)) return;
        TextView b = Ui.button(this, address, 30, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openGame(address);
            }
        });
        b.setMinWidth(Ui.dp(this, 460));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        results.addView(b, lp);
        hint.setText("Press OK to start playing.");
        if (found.size() == 1 && !typeButton.hasFocus()) b.requestFocus();
    }

    private void openGame(String address) {
        stopScan();
        scanGeneration++;
        Intent intent = new Intent(this, GameActivity.class);
        intent.putExtra(GameActivity.EXTRA_ADDRESS, address);
        startActivity(intent);
        finish();
    }

    // ---------------------------------------------------------------- keypad screen

    private View buildKeypadScreen() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setPadding(Ui.dp(this, 48), Ui.dp(this, 28), Ui.dp(this, 48), Ui.dp(this, 28));
        row.setClipChildren(false);

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        left.setPadding(0, 0, Ui.dp(this, 36), 0);

        left.addView(Ui.text(this, "Type the address", 34, Ui.PINK, true), wrap());
        TextView help = Ui.text(this,
                "It's on your computer's screen,\nlike 192.168.1.20:5173", 18, Ui.TEXT_SOFT, false);
        help.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 16));
        left.addView(help, wrap());

        keypadDisplay = Ui.text(this, "", 26, Ui.TEXT, true);
        keypadDisplay.setBackgroundResource(R.drawable.bg_panel);
        keypadDisplay.setGravity(Gravity.CENTER_VERTICAL);
        keypadDisplay.setPadding(Ui.dp(this, 20), Ui.dp(this, 14), Ui.dp(this, 20), Ui.dp(this, 14));
        keypadDisplay.setMinWidth(Ui.dp(this, 300));
        keypadDisplay.setSingleLine(true);
        left.addView(keypadDisplay, wrap());

        keypadMessage = Ui.text(this, "", 17, Ui.YELLOW, false);
        keypadMessage.setPadding(0, Ui.dp(this, 12), 0, 0);
        left.addView(keypadMessage, wrap());
        row.addView(left, wrap());

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setClipChildren(false);
        String[] keys = {"1", "2", "3", "Delete", "4", "5", "6", ".", "7", "8", "9", ":", "Clear", "0", "Go"};
        for (final String key : keys) {
            float sp = key.length() == 1 ? 32 : 22;
            TextView b = Ui.button(this, key, sp, new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    onKey(key);
                }
            });
            b.setPadding(0, 0, 0, 0);
            boolean wide = key.equals("Go");
            if (wide) b.setTextColor(Ui.YELLOW);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams(
                    GridLayout.spec(GridLayout.UNDEFINED),
                    GridLayout.spec(GridLayout.UNDEFINED, wide ? 2 : 1));
            int m = Ui.dp(this, 7);
            lp.width = wide ? Ui.dp(this, 100) * 2 + m * 2 : Ui.dp(this, 100);
            lp.height = Ui.dp(this, 72);
            lp.setMargins(m, m, m, m);
            grid.addView(b, lp);
            if (firstKey == null) firstKey = b;
        }
        row.addView(grid, wrap());
        return row;
    }

    private void onKey(String key) {
        keypadMessage.setText("");
        if (key.equals("Delete")) {
            if (typed.length() > 0) typed.setLength(typed.length() - 1);
        } else if (key.equals("Clear")) {
            typed.setLength(0);
        } else if (key.equals("Go")) {
            String address = Net.normalize(typed.toString());
            if (address == null) {
                keypadMessage.setText("Hmm, that doesn't look right yet.\nIt should look like 192.168.1.20");
                return;
            }
            openGame(address);
            return;
        } else if (typed.length() < 21) {
            typed.append(key);
        }
        refreshDisplay();
    }

    private void refreshDisplay() {
        String value = typed.toString();
        boolean hasPort = value.indexOf(':') >= 0;
        // Show the port that will be used when none is typed.
        keypadDisplay.setText(hasPort || value.isEmpty() ? value + "▁" : value + "▁  (:" + Net.DEFAULT_PORT + ")");
    }

    private void showKeypad() {
        stopScan();
        scanGeneration++;
        if (typed.length() == 0 && subnetHint != null) typed.append(subnetHint);
        keypadMessage.setText("");
        refreshDisplay();
        listScreen.setVisibility(View.GONE);
        keypadScreen.setVisibility(View.VISIBLE);
        firstKey.requestFocus();
    }

    private void showList() {
        keypadScreen.setVisibility(View.GONE);
        listScreen.setVisibility(View.VISIBLE);
        typeButton.requestFocus();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keypadScreen.getVisibility() == View.VISIBLE) {
            if (keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9) {
                onKey(String.valueOf(keyCode - KeyEvent.KEYCODE_0));
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_PERIOD || keyCode == KeyEvent.KEYCODE_NUMPAD_DOT) {
                onKey(".");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DEL) {
                onKey("Delete");
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (keypadScreen.getVisibility() == View.VISIBLE) {
            showList();
            startScan();
            return;
        }
        super.onBackPressed();
    }

    private static LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
}
