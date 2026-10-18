package com.gamenightos.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Game screen: the game computer's /tv page in a full-screen WebView. The page drives itself
 * with arrow keys and Enter, so D-pad events go straight to the WebView. Back asks before
 * leaving; a page that cannot load shows a friendly message instead of a blank screen.
 */
public class GameActivity extends Activity {
    static final String EXTRA_ADDRESS = "address";

    /** Give a slow first load (e.g. a cold Vite dev server) this long before calling it failed. */
    private static final long LOAD_TIMEOUT_MS = 30000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView webView;
    private View errorOverlay;
    private TextView errorDetail;
    private TextView retryButton;
    private Dialog leaveDialog;
    private String address;
    private String url;
    private boolean loadFailed = false;

    private final Runnable loadTimeout = new Runnable() {
        @Override
        public void run() {
            showError("The game computer is taking too long to answer.");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        address = getIntent().getStringExtra(EXTRA_ADDRESS);
        if (address == null) {
            findComputer();
            return;
        }
        url = "http://" + address + "/tv";

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Ui.NIGHT);
        webView = createWebView();
        root.addView(webView, matchParent());
        errorOverlay = buildErrorOverlay();
        errorOverlay.setVisibility(View.GONE);
        root.addView(errorOverlay, matchParent());
        setContentView(root);

        load();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Ui.NIGHT);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        view.setKeepScreenOn(true);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);

        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String u) {
                return false; // keep every navigation inside the app
            }

            @Override
            public void onPageStarted(WebView v, String u, Bitmap favicon) {
                handler.removeCallbacks(loadTimeout);
                if (!loadFailed) handler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
            }

            @Override
            public void onPageFinished(WebView v, String u) {
                handler.removeCallbacks(loadTimeout);
                if (!loadFailed && u != null && u.startsWith("http")) {
                    Net.rememberAddress(GameActivity.this, address);
                    v.requestFocus();
                }
            }

            // API 23+
            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError("We couldn't reach the game computer.");
                }
            }

            // API 21-22
            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView v, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < 23) {
                    showError("We couldn't reach the game computer.");
                }
            }

            @Override
            public void onReceivedHttpError(WebView v, WebResourceRequest request,
                                            WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    showError("The game computer answered, but the game page isn't there ("
                            + response.getStatusCode() + ").");
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // The page's renderer crashed: throw this WebView away and start over.
                handler.removeCallbacks(loadTimeout);
                ViewGroup parent = (ViewGroup) v.getParent();
                if (parent != null) parent.removeView(v);
                v.destroy();
                if (v == webView) webView = null;
                recreate();
                return true;
            }
        });
        return view;
    }

    private void load() {
        loadFailed = false;
        errorOverlay.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
        webView.requestFocus();
    }

    private void showError(String message) {
        if (loadFailed) return;
        loadFailed = true;
        handler.removeCallbacks(loadTimeout);
        if (webView != null) {
            webView.stopLoading();
            webView.setVisibility(View.INVISIBLE);
        }
        errorDetail.setText(message + "\n\nCheck the game is running on your computer and that the TV\n"
                + "is on the same Wi-Fi. Address: " + address);
        errorOverlay.setVisibility(View.VISIBLE);
        retryButton.requestFocus();
    }

    private View buildErrorOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Ui.NIGHT);
        overlay.setClickable(true);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        panel.setBackgroundResource(R.drawable.bg_panel);
        int p = Ui.dp(this, 36);
        panel.setPadding(p, p, p, p);
        panel.setClipChildren(false);

        TextView title = Ui.text(this, "Oops! The game went hiding", 34, Ui.YELLOW, true);
        title.setGravity(Gravity.CENTER);
        panel.addView(title, wrap());

        errorDetail = Ui.text(this, "", 19, Ui.TEXT_SOFT, false);
        errorDetail.setGravity(Gravity.CENTER);
        errorDetail.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 24));
        panel.addView(errorDetail, wrap());

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setClipChildren(false);
        retryButton = Ui.button(this, "Try again", 24, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                load();
            }
        });
        TextView find = Ui.button(this, "Find computer", 24, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                findComputer();
            }
        });
        LinearLayout.LayoutParams lp = wrap();
        lp.setMargins(Ui.dp(this, 12), 0, Ui.dp(this, 12), 0);
        row.addView(retryButton, lp);
        row.addView(find, new LinearLayout.LayoutParams(lp));
        panel.addView(row, wrap());

        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        overlay.addView(panel, plp);
        return overlay;
    }

    // ---------------------------------------------------------------- keys

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
                if (errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
                    findComputer();
                } else {
                    showLeaveDialog();
                }
            }
            return true;
        }
        // Make sure the OK / select button arrives in the page as "Enter".
        boolean playing = webView != null && errorOverlay != null
                && errorOverlay.getVisibility() != View.VISIBLE;
        if (playing && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_BUTTON_A)) {
            if (!webView.hasFocus()) webView.requestFocus();
            KeyEvent enter = new KeyEvent(event.getDownTime(), event.getEventTime(), event.getAction(),
                    KeyEvent.KEYCODE_ENTER, event.getRepeatCount(), event.getMetaState(),
                    event.getDeviceId(), event.getScanCode(), event.getFlags(), event.getSource());
            return webView.dispatchKeyEvent(enter);
        }
        if (playing && !webView.hasFocus() && isArrowOrEnter(code)) {
            webView.requestFocus();
            return webView.dispatchKeyEvent(event);
        }
        return super.dispatchKeyEvent(event);
    }

    private static boolean isArrowOrEnter(int code) {
        return code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN
                || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
                || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    private void showLeaveDialog() {
        if (leaveDialog != null && leaveDialog.isShowing()) return;
        final Dialog dialog = new Dialog(this, R.style.GameDialog);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        panel.setBackgroundResource(R.drawable.bg_panel);
        int p = Ui.dp(this, 32);
        panel.setPadding(p, p, p, p);
        panel.setClipChildren(false);
        panel.setClipToPadding(false);

        TextView title = Ui.text(this, "Leave the game?", 34, Ui.PINK, true);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, Ui.dp(this, 22));
        panel.addView(title, wrap());

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);
        row.setClipChildren(false);
        final TextView keep = Ui.button(this, "Keep playing", 24, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
            }
        });
        TextView change = Ui.button(this, "Change computer", 24, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                findComputer();
            }
        });
        TextView exit = Ui.button(this, "Exit", 24, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
                finish();
            }
        });
        LinearLayout.LayoutParams lp = wrap();
        lp.setMargins(Ui.dp(this, 10), 0, Ui.dp(this, 10), 0);
        row.addView(keep, lp);
        row.addView(change, new LinearLayout.LayoutParams(lp));
        row.addView(exit, new LinearLayout.LayoutParams(lp));
        panel.addView(row, wrap());

        dialog.setContentView(panel);
        dialog.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(android.content.DialogInterface d) {
                hideSystemUi();
                if (webView != null && errorOverlay.getVisibility() != View.VISIBLE) {
                    webView.requestFocus();
                }
            }
        });
        leaveDialog = dialog;
        dialog.show();
        keep.requestFocus();
    }

    private void findComputer() {
        Intent intent = new Intent(this, FinderActivity.class);
        intent.putExtra(FinderActivity.EXTRA_NO_AUTO, true);
        startActivity(intent);
        finish();
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            if (errorOverlay.getVisibility() != View.VISIBLE) webView.requestFocus();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (leaveDialog != null && leaveDialog.isShowing()) leaveDialog.dismiss();
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private static FrameLayout.LayoutParams matchParent() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private static LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
}
