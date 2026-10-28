!macro customInstall
  SetDetailsPrint both
  DetailPrint "正在安装已校验的视频组件……"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$DESKTOP\短剧投流素材平台（新数据）.lnk" "$appExe" "--new-profile"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\短剧投流素材平台（新数据）.lnk" "$appExe" "--new-profile"
  DetailPrint "视频组件已安装，桌面快捷方式可直接启动软件EXE。"
!macroend

!macro customUnInstallSection
  Section "Remove new-data shortcut"
    Delete "$DESKTOP\短剧投流素材平台（新数据）.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}\短剧投流素材平台（新数据）.lnk"
    RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  SectionEnd
!macroend
