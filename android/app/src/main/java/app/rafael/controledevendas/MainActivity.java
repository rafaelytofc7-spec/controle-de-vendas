package app.rafael.controledevendas;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tornarWebViewTransparente();
    }

    @Override
    public void onResume() {
        super.onResume();
        tornarWebViewTransparente();
    }

    private void tornarWebViewTransparente() {
        if (getBridge() == null) return;
        WebView view = getBridge().getWebView();
        if (view == null) return;
        // Needed so startScan() can show the camera behind the WebView.
        view.setBackgroundColor(Color.TRANSPARENT);
    }
}
