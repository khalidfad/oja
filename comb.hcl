recursive = true
output_file = "oja.txt"
extensions = [".css",".js",".html"]
exclude_dirs {
  items = ["lab", "bin", "dist","node_modules"]
}
exclude_files {
  items = ["*.log","*.txt","agbero","package-lock.json"]
}
use_gitignore = true
detailed = true
minify = false
zip = false