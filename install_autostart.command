#!/bin/bash
# ============================================================
#  学术工作台 · 一键安装开机自启（macOS LaunchAgent）
#
#  双击本文件即可。装完之后：
#    * 开机 / 重新登录后，工作台服务会自动在后台启动
#    * 收藏夹里的 http://127.0.0.1:8765 直接点开就能用
#    * 服务意外退出会被系统自动拉起（保活）
#
#  想取消自启：执行
#    launchctl unload ~/Library/LaunchAgents/com.phd.workbench.plist
#    rm ~/Library/LaunchAgents/com.phd.workbench.plist
#  （或直接告诉我，我来帮你卸）
# ============================================================
cd "$(dirname "$0")" || exit 1
BASE_DIR="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/com.phd.workbench.plist"
LABEL="com.phd.workbench"

echo "============================================"
echo "  学术工作台 · 安装开机自启"
echo "============================================"
echo ""
echo "工作台目录：$BASE_DIR"

# ---- 1. 找一个可用的 python3（Homebrew 优先，与 start.command 一致）----
PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$c" ]; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "❌ 没找到 python3，无法安装。请先安装 Python 3。"
  read -p "按回车键关闭..." _
  exit 1
fi
echo "使用 Python：$PY"

# ---- 2. 生成 LaunchAgent 配置 ----
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY</string>
        <string>server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$BASE_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>$BASE_DIR/data/server.log</string>
    <key>StandardErrorPath</key>
    <string>$BASE_DIR/data/server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLISTEOF
echo "✅ 已生成配置：$PLIST"

# ---- 3. 加载（先卸旧的，避免重复）----
launchctl unload "$PLIST" 2>/dev/null
# 若服务正被手动运行着，先停掉，交给 launchd 统一管理（避免两个进程抢端口）
if curl -s -m 2 --noproxy '*' http://127.0.0.1:8765/ > /dev/null 2>&1; then
  echo "检测到工作台已在运行，正在切换到后台托管…"
  lsof -ti :8765 2>/dev/null | xargs kill 2>/dev/null
  sleep 1
fi

# 注册：老写法 launchctl load，新写法 bootstrap，两种都试
LOADED=0
launchctl load "$PLIST" 2>/dev/null && LOADED=1
if [ "$LOADED" != "1" ]; then
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null && LOADED=1
fi
if [ "$LOADED" = "1" ]; then
  launchctl enable "gui/$(id -u)/$LABEL" 2>/dev/null
  echo "✅ 已注册为后台服务"
else
  echo "⚠️ 注册后台服务失败，将尝试直接后台启动作为兜底"
fi

# ---- 4. 验证 ----
echo "正在验证…"
OK=0
for i in 1 2 3 4 5 6 7 8; do
  sleep 1
  if curl -s -m 2 --noproxy '*' http://127.0.0.1:8765/ > /dev/null 2>&1; then OK=1; break; fi
done

# 兜底：注册没成功或服务没起来，就手动在后台拉起来，至少保证能访问
if [ "$OK" != "1" ]; then
  echo "服务未响应，尝试手动后台启动…"
  lsof -ti :8765 2>/dev/null | xargs kill 2>/dev/null
  sleep 1
  nohup "$PY" server.py > data/server.log 2>&1 &
  for i in 1 2 3 4 5; do
    sleep 1
    if curl -s -m 2 --noproxy '*' http://127.0.0.1:8765/ > /dev/null 2>&1; then OK=2; break; fi
  done
fi

echo ""
if [ "$OK" = "1" ]; then
  echo "============================================"
  echo "  🎉 安装成功！"
  echo "============================================"
  echo ""
  echo "从现在起："
  echo "  • 以后开机就能直接用，点浏览器收藏夹里的"
  echo "    http://127.0.0.1:8765 即可打开工作台"
  echo "  • 不再需要每次双击 start.command"
  echo "  • 服务若意外退出，系统会自动把它拉起来"
  echo ""
  echo "（转写引擎会由工作台自动守护，无需另外启动）"
elif [ "$OK" = "2" ]; then
  echo "============================================"
  echo "  ⚠️ 部分成功"
  echo "============================================"
  echo ""
  echo "工作台已能在后台运行（收藏夹地址可以正常打开），"
  echo "但「开机自动启动」没能注册成功——可能被系统权限拦下了。"
  echo ""
  echo "不影响现在使用；下次电脑重启后如果打不开，"
  echo "再双击一次本文件，或双击 start.command 即可。"
else
  echo "❌ 启动失败，请查看日志：data/server.log"
  echo "也可以先双击 start.command 手动启动一次。"
fi
echo ""
read -p "按回车键关闭..." _
