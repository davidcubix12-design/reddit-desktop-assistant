Option Explicit

Dim files, shell, folder, executable, scriptPath, command
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
folder = files.GetParentFolderName(WScript.ScriptFullName)
scriptPath = folder & "\server.mjs"
executable = folder & "\runtime\node.exe"
If Not files.FileExists(executable) Then executable = "node.exe"

shell.CurrentDirectory = folder
command = Chr(34) & executable & Chr(34) & " " & Chr(34) & scriptPath & Chr(34) & " --open"
On Error Resume Next
shell.Run command, 0, False
If Err.Number <> 0 Then
  MsgBox "Cannot start Reddit Desktop Assistant. Install Node.js 22 or newer, or add runtime\node.exe beside this launcher.", vbExclamation, "Reddit Desktop Assistant"
End If
