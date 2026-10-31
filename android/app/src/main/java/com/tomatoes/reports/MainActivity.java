package com.tomatoes.reports;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Browser-backed Android shell: credentials and report data stay in the web app's origin. */
public class MainActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        // Launch only the build's configured origin, never arbitrary incoming Intent URLs.
        return Uri.parse(getString(R.string.launch_url));
    }
}
