; Handwritten companion source. Keep this comment and declarations unchanged.
; Generated visual events belong in the separate gs_logic.hsc module.
(global short c68_manual_counter 41)
(script static short c68_manual_value
  (+ c68_manual_counter 1)
)
(script startup c68_manual_init
  (set c68_manual_counter (c68_manual_value))
)
