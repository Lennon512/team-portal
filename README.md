# team-portal

Stretch Zone Austin team portal. A static site (no build step) that talks to Supabase.

## Layout

```
index.html            Page markup only; loads the files below in order
css/base.css          Layout and component styles
css/glass.css         The glassy theme layered on top (colors, panels, bottom tab bar)
img/studio-bg.jpg     Blurred studio photo behind the glass
js/core.js            Supabase client, sign-in, navigation, shared helpers
js/<page>.js          One file per page: calendar, tasks, members, timeoff, mypage,
                      studio, performance, compare, projection, performance-uploads,
                      supplies, dpr, passwords, leadership, access, invite, payroll
js/start.js           Loaded last; starts the app
```

## Rules for editing

- The scripts are plain `<script>` tags that share one global scope, and **order matters**.
  A file may only *call* (at load time) functions defined in itself or an earlier file.
  Inside event handlers anything goes, because those run after every file has loaded.
  When wiring a handler to a function from a later file, wrap it: `onclick = () => fn()`.
- After changing CSS or JS, bump the `?v=` number on its tag in `index.html` so browsers
  pick up the new file instead of a cached one.
- Make changes on a branch and merge via a pull request; avoid uploading files straight to `main`.
