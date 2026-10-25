include $(TOPDIR)/rules.mk

LUCI_TITLE:=Pulse - Lightweight router dashboard
LUCI_DEPENDS:=+luci-base +rpcd-mod-luci +rpcd-mod-file +ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uloop
LUCI_PKGARCH:=all
# SDK csstidy drops @supports rules used by the theme.
LUCI_MINIFY_CSS:=0
PKG_LICENSE:=MIT
PKG_VERSION:=1.0.2
PKG_RELEASE:=1

define Build/Prepare/luci-app-pulse
	$(SHELL) $(CURDIR)/generate-version.sh $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/pulse/index.js
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
