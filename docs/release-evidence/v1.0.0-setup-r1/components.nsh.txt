!macro customInstall
  SetDetailsPrint both
  DetailPrint "正在从固定上游获取并校验视频组件，请保持联网……"
  nsExec::ExecToStack /TIMEOUT=180000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\install\InitializeComponents.ps1" -PrepareOnly'
  Pop $0
  Pop $1
  StrCmp $0 "0" components_ready
    Delete "$newDesktopLink"
    Delete "$newStartMenuLink"
    DetailPrint "视频组件准备失败，安装未完成。请联网后重新运行安装程序。"
    IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "视频组件准备失败，安装未完成。请检查网络后重新运行安装程序；也可从Windows应用列表卸载未完成的安装。项目数据和原片未被修改。"
    SetErrorLevel 2
    Abort
  components_ready:
  DetailPrint "视频组件校验完成，桌面快捷方式可直接启动软件EXE。"
!macroend
