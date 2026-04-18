"""Otimiza imagens do jogo: redimensiona pra 300px e comprime PNG"""
from PIL import Image
import os

PUBLIC = os.path.join(os.path.dirname(__file__), "..", "public")

# Imagens do jogo que precisam otimizar (nao mexer em banners/logos do site)
GAME_IMAGES = [
    "MOTOBOY.png",
    "GUNCHO CET.png",
    "POLICIA RODOVIARIA.png",
    "CAMINHAO CEGONHA.png",
    "O Bruto do Porto.png",
    "O Coletor.png",
    "sacos de lixo.png",
    "cavaletes.png",
    "cavalete 2.png",
    "cavalete 3.png",
    "CONE.png",
    "caixa grande de madeira.png",
    "caixa grande de madeira 2.png",
    "caixa grande de madeira 3.png",
    "CONTAINER BOSS PORTO.png",
    "CONTAINER BOSS PORTO 2.png",
    "veiculo 1.png",
    "veiculo 2.png",
    "veiculo 3.png",
    "veiculo 4.png",
    "truck-strada.png",
    "truck-trucado.png",
    "otimizi industria.png",
]

MAX_WIDTH = 400  # px - suficiente pro jogo (desenha em 50-200px)
total_antes = 0
total_depois = 0

for fname in GAME_IMAGES:
    fpath = os.path.join(PUBLIC, fname)
    if not os.path.exists(fpath):
        print(f"  SKIP {fname} (nao encontrado)")
        continue

    antes = os.path.getsize(fpath)
    total_antes += antes

    img = Image.open(fpath)
    # Redimensiona mantendo proporcao
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        new_h = int(img.height * ratio)
        img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)

    # Salva otimizado (PNG com compress_level alto)
    img.save(fpath, "PNG", optimize=True)

    depois = os.path.getsize(fpath)
    total_depois += depois
    reducao = ((antes - depois) / antes * 100)
    print(f"  {fname}: {antes//1024}KB -> {depois//1024}KB ({reducao:.0f}% menor)")

print(f"\nTOTAL: {total_antes//1024//1024}MB -> {total_depois//1024//1024}MB ({(total_antes-total_depois)//1024//1024}MB economizados)")
