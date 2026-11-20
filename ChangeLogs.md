
### Next
  #### Missing return is an error (C++)
   - Fixed : Lint never reported "control reaches end of non-void function" (GCC skips it under -fsyntax-only); now compiled with -S and -Werror=return-type
   - Added : also checks unused class/inline member functions (-fkeep-inline-functions); main() is exempt as in the standard
   - Added Settings : "Missing return = error (C++)" (on by default, applies to Lint and Run; skipped if your own compiler flags mention return-type)
## C/C++ Tools 

### 2.1.3 
   - Added Settings : Lint refresh delay
   - Added Go to Reference Popup
    ![Cpp_Reference_Popup](https://i.postimg.cc/Y26CWBHP/C-Cpp-Plugin-Reference-popup.jpg)
### 2.1.2
   - Fixed : linter trigger & request queue
### 2.1.1
   - Fixed minor ui bug
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
### 2.0.3
 - Fix : Dependencies management 
 - Upgrade : Problems page 
 - Fixes : Other
### 2.0.2
### 2.0.1
 - fix: tree sitter parse error
### 2.0.0
 - Workspace sync issue fixed (cm6)
 - Problems page
 - `Go To Def` in Selection menu
 - More
### 1.0.9 
 - Uses c language server in CM6
 - FIX: Header linter error even exist
 - ADD: Some settings
 - Some Bug fixed
 - NEXT UPDATE ..soon
### 1.0.8
 - Multi-file Compilation
 - Go to Definition
### 1.0.7
 - CM6 + Ace both support
 - Next update coming soon
### 1.0.6
 - Bug fixed
### 1.0.5
 - Auto import system 
 - Some Bug fixed
 - Check description for more 
### 1.0.4
 - Inline errors/warns or logs
 - Terminal re-use
 - Some Bug Fixed
 - Check description for more

### 1.0.3 
 - Enhached Snippets 
 - Separate snippet key for C & C++ in saved .json