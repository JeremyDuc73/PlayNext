!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Installation de PlayNext pour l'utilisateur courant"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  MessageBox MB_ICONINFORMATION|MB_OK "PlayNext est installé. Lance l'application depuis le menu Démarrer."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "PlayNext a été désinstallé"
!macroend
