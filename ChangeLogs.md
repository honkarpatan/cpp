
### Next
  #### Libraries (package manager)
   - Added : Tools → Libraries (and Settings → Dependencies → Libraries): one-tap install/remove of SQLite, libcurl, OpenSSL, SDL2, Boost, fmt, GoogleTest… through Alpine `apk`
   - Added : Auto-link — `#include <sqlite3.h>` is built with the right `-I/-l` flags (pkg-config) for Run and Lint, no Makefile needed
   - Added : "Used in this file — not installed" banner, Insert `#include`, search all Alpine `-dev` packages
   - Added : Lint shows "install X from Tools → Libraries" for missing library headers

### 2.1.0
  #### Buffer Problem
   - Fixed : Pseudo-Terminal (PTY) for compiler default stream buffer problem
   - Added Settings : Auto buffer fix
  #### Run Mode 
   - Available Three type of Run Mode :
     1. Run in terminal
     2. Run in Quick Popup
     3. Run in Inline Logs (beta)

     ![Run In Inline Logs](https://i.postimg.cc/cLDMw1Tb/Picsart-26-10-30-14-16-15-235.png)
     
  #### Inline Input 
   - You can quickly give input through inline Editor input chips
   - Datatypes , multiple input , loop aware , Live Input Variable Update .etc
  #### Settings Ui
   - Plugin's Settings are now available in Category Wise

   ![Settings Ui](https://i.postimg.cc/c17zY0S7/Screenshot-2026-10-30-12-06-57-88-e3c1f266f17b29c7b40472751f031275.jpg)

  #### Explore More.. 
  #### Upcoming Release 
   - Full Ai (fix , Generate , Modify) , Reads and correct errors , C/Cpp Tools Button