package com.gamenightos.tv;

import android.content.Context;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.TextView;

/** Small helpers for building the remote-friendly UI in code (no layout XML, no androidx). */
final class Ui {
    static final int NIGHT = 0xff0b0620;
    static final int NIGHT_RAISED = 0xff1c1240;
    static final int PINK = 0xffff4f9a;
    static final int YELLOW = 0xffffd23f;
    static final int CYAN = 0xff3ee0d0;
    static final int TEXT = 0xffffffff;
    static final int TEXT_SOFT = 0xffc9bff0;

    private Ui() {}

    static int dp(Context ctx, float value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, ctx.getResources().getDisplayMetrics()));
    }

    static TextView text(Context ctx, String value, float sp, int color, boolean bold) {
        TextView tv = new TextView(ctx);
        tv.setText(value);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    /**
     * A big focusable "button". It is a TextView so the Material button styling (all caps,
     * elevation animator) stays out of the way; View already turns DPAD_CENTER / ENTER into a
     * click for clickable views. Focus shows a yellow border (bg_button) and a gentle zoom.
     */
    static TextView button(Context ctx, String label, float sp, View.OnClickListener onClick) {
        final TextView b = text(ctx, label, sp, TEXT, true);
        b.setGravity(Gravity.CENTER);
        b.setBackgroundResource(R.drawable.bg_button);
        int h = dp(ctx, 28);
        int v = dp(ctx, 14);
        b.setPadding(h, v, h, v);
        b.setFocusable(true);
        b.setFocusableInTouchMode(false);
        b.setClickable(true);
        b.setOnClickListener(onClick);
        b.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                float s = hasFocus ? 1.08f : 1f;
                view.animate().scaleX(s).scaleY(s).setDuration(120).start();
            }
        });
        return b;
    }
}
