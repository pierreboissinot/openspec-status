# Run from the repository root: vhs demo/demo.tape
Output demo/demo.gif
Output demo/demo.mp4

Require claude
Require openspec
Require git

Set Shell "bash"
Set FontSize 18
Set Width 1280
Set Height 960
Set Padding 24
Set WindowBar Colorful
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms

Hide
Type 'source "$(demo/setup.sh "$(mktemp -d)")"'
Enter
Sleep 3s
# A first launch shows one-time notices; the recorded launch is the second one.
Type "claude"
Enter
Sleep 8s
Ctrl+C
Ctrl+C
Sleep 2s
Type "demo_changes 6; clear"
Enter
Sleep 500ms
Show

Type "claude"
Enter
Sleep 7s

Type "/openspec"
Sleep 600ms
Enter
Sleep 4s

Type "/openspec view"
Sleep 600ms
Enter
Sleep 4s
Ctrl+X
Tab
Sleep 1s
Type "2"
Sleep 3s
PageDown
Sleep 3s
Type "1"
Sleep 2s
Escape
Sleep 2s
