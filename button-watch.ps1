# Monitors the left mouse button and reports press/release over stdout:
#   PRESS <x> <y>   button went down (x,y = cursor screen position)
#   RELEASE         button went up
# Spawned by the main process while the pet is loading, so drag start/stop
# does not depend on renderer events (the renderer main thread is blocked by
# texture decode and pointerup events are coalesced/dropped/spurious).
# NOTE: keep this file pure ASCII - Windows PowerShell 5.1 reads .ps1 files
# without a BOM as ANSI (GBK), and non-ASCII bytes can break parsing.
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;
public struct POINT { public int X; public int Y; }
public class K{
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
}'
while ($true) {
  while (-not ([K]::GetAsyncKeyState(1) -band 0x8000)) {
    Start-Sleep -Milliseconds 20
  }
  $p = [POINT]::new()
  [K]::GetCursorPos([ref]$p) | Out-Null
  [Console]::Out.WriteLine("PRESS $($p.X) $($p.Y)")
  [Console]::Out.Flush()
  while (([K]::GetAsyncKeyState(1) -band 0x8000) -ne 0) {
    Start-Sleep -Milliseconds 20
  }
  [Console]::Out.WriteLine("RELEASE")
  [Console]::Out.Flush()
}
