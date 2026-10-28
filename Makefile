include $(TOPDIR)/rules.mk

LUCI_TITLE:=Pulse - Lightweight router dashboard
LUCI_DEPENDS:=+luci-base +rpcd-mod-luci +rpcd-mod-file +ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uloop
LUCI_PKGARCH:=all
LUCI_MINIFY_CSS:=0
PKG_LICENSE:=MIT
PULSE_RELEASE:=1.0.3
PULSE_VERSION?=$(PULSE_RELEASE)
PKG_VERSION:=$(PULSE_VERSION)
ifeq ($(strip $(PKG_VERSION)),)
  $(error Pulse version must not be empty)
endif
PKG_RELEASE:=2

PULSE_LANGUAGES:=$(sort $(filter-out templates,$(notdir $(wildcard ./po/*))))
override LUCI_LANGUAGES:=
PKG_PROVIDES=$(foreach lang,$(PULSE_LANGUAGES),luci-i18n-pulse-$(firstword $(LUCI_LC_ALIAS.$(lang)) $(lang)))

define Build/PulseTranslations
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/root$(LUCI_LIBRARYDIR)/i18n
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/root/etc/uci-defaults
	printf '#!/bin/sh\n' > $(PKG_BUILD_DIR)/root/etc/uci-defaults/91-pulse-languages
	set -e; $(foreach lang,$(PULSE_LANGUAGES), \
		po2lmo ./po/$(lang)/pulse.po \
			$(PKG_BUILD_DIR)/root$(LUCI_LIBRARYDIR)/i18n/pulse.$(firstword $(LUCI_LC_ALIAS.$(lang)) $(lang)).lmo; \
		printf '%s\n' "uci set luci.languages.$(subst -,_,$(firstword $(LUCI_LC_ALIAS.$(lang)) $(lang)))='$(LUCI_LANG.$(lang))'" \
			>> $(PKG_BUILD_DIR)/root/etc/uci-defaults/91-pulse-languages;)
	printf 'uci commit luci\nexit 0\n' >> $(PKG_BUILD_DIR)/root/etc/uci-defaults/91-pulse-languages
endef
Hooks/Compile/Post += Build/PulseTranslations

define Build/Prepare/luci-app-pulse
	$(SHELL) $(CURDIR)/generate-version.sh --write "$(PKG_VERSION)" $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/pulse/index.js
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
