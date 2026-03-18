# oja/Makefile
#
# Requirements (install once):
#   npm install --save-dev esbuild clean-css-cli
#
# Usage:
#   make          → build everything
#   make js       → JS only
#   make css      → CSS only
#   make watch    → rebuild on save (dev)
#   make clean    → remove build/
#   make check    → show output sizes

SRC_DIR   = src
JS_DIR    = $(SRC_DIR)/js
CSS_DIR   = $(SRC_DIR)/css
CODEC_DIR = $(SRC_DIR)/js/codecs
BUILD_DIR = build

JS_ENTRY  = $(SRC_DIR)/oja.js

JS_IIFE   = $(BUILD_DIR)/oja.min.js
JS_ESM    = $(BUILD_DIR)/oja.esm.js
CSS_OUT   = $(BUILD_DIR)/oja.min.css

JS_SOURCES  = $(wildcard $(JS_DIR)/*.js) $(wildcard $(CODEC_DIR)/*.js) $(JS_ENTRY)
CSS_SOURCES = $(wildcard $(CSS_DIR)/*.css)

# ─── Default ──────────────────────────────────────────────────────────────────

all: $(JS_IIFE) $(JS_ESM) $(CSS_OUT)

# ─── JS ───────────────────────────────────────────────────────────────────────

$(JS_IIFE): $(JS_SOURCES)
	@mkdir -p $(BUILD_DIR)
	@echo "› Building IIFE bundle..."
	@npx esbuild $(JS_ENTRY) \
		--bundle \
		--minify \
		--format=iife \
		--global-name=Oja \
		--outfile=$(JS_IIFE) \
		--log-level=warning
	@echo "✓ $(JS_IIFE)  ($$(du -sh $(JS_IIFE) | cut -f1))"

$(JS_ESM): $(JS_SOURCES)
	@mkdir -p $(BUILD_DIR)
	@echo "› Building ESM bundle..."
	@npx esbuild $(JS_ENTRY) \
		--bundle \
		--minify \
		--format=esm \
		--outfile=$(JS_ESM) \
		--log-level=warning
	@echo "✓ $(JS_ESM)  ($$(du -sh $(JS_ESM) | cut -f1))"

js: $(JS_IIFE) $(JS_ESM)

# ─── CSS ──────────────────────────────────────────────────────────────────────

$(CSS_OUT): $(CSS_SOURCES)
	@mkdir -p $(BUILD_DIR)
	@echo "› Minifying CSS..."
	@npx clean-css-cli $(CSS_DIR)/oja.css -o $(CSS_OUT)
	@echo "✓ $(CSS_OUT)  ($$(du -sh $(CSS_OUT) | cut -f1))"

css: $(CSS_OUT)

# ─── Dev ──────────────────────────────────────────────────────────────────────

watch:
	@echo "› Watching $(SRC_DIR)/ ..."
	@npx esbuild $(JS_ENTRY) \
		--bundle \
		--format=iife \
		--global-name=Oja \
		--outfile=$(JS_IIFE) \
		--watch \
		--log-level=info

# ─── Info ─────────────────────────────────────────────────────────────────────

check:
	@echo ""
	@echo "  Build output"
	@echo "  ────────────────────────────────────────"
	@[ -f $(JS_IIFE) ] \
		&& printf "  IIFE  %-30s %s\n" "$(JS_IIFE)"  "$$(du -sh $(JS_IIFE)  | cut -f1)" \
		|| echo "  IIFE  not built — run: make js"
	@[ -f $(JS_ESM) ] \
		&& printf "  ESM   %-30s %s\n" "$(JS_ESM)"   "$$(du -sh $(JS_ESM)   | cut -f1)" \
		|| echo "  ESM   not built — run: make js"
	@[ -f $(CSS_OUT) ] \
		&& printf "  CSS   %-30s %s\n" "$(CSS_OUT)"  "$$(du -sh $(CSS_OUT)  | cut -f1)" \
		|| echo "  CSS   not built — run: make css"
	@echo "  ────────────────────────────────────────"
	@echo "  Sources"
	@echo "  ────────────────────────────────────────"
	@printf "  JS core   %d files\n" "$$(ls $(JS_DIR)/*.js    2>/dev/null | wc -l | tr -d ' ')"
	@printf "  Codecs    %d files\n" "$$(ls $(CODEC_DIR)/*.js 2>/dev/null | wc -l | tr -d ' ')"
	@printf "  CSS       %d files\n" "$$(ls $(CSS_DIR)/*.css  2>/dev/null | wc -l | tr -d ' ')"
	@echo ""

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	@rm -f $(JS_IIFE) $(JS_ESM) $(CSS_OUT)
	@echo "✓ Cleaned"

.PHONY: all js css watch check clean