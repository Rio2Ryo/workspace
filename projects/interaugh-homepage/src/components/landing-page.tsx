import { LandingPageEffects } from "./landing-page-effects";

const landingHtml = `
<header id="hdr">
  <div class="wrap nav">
    <a href="#" class="brand"><span class="seal-mini">巻</span>Interaugh</a>
    <nav class="nav-links" id="navlinks">
      <a href="#mission">理念</a>
      <a href="#services">事業</a>
      <a href="#craft">制作</a>
      <a href="#contact" class="nav-cta">CONTACT</a>
    </nav>
    <button class="nav-toggle" id="navToggle" aria-label="メニュー">≡</button>
  </div>
</header>

<!-- HERO -->
<section class="hero">
  <span class="vrune">日本の才能を世界へ</span>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">Web3 × 日本のものづくり</span>
      <h1>世界を、<br><span class="roll">巻き込む</span>。
        <span class="en">Involve the World</span>
      </h1>
      <p class="lead">アニメ、マンガ、工芸——。日本の才能は、まだ世界に届ききっていない。Interaughは、Web3で「言葉の壁」と「届け方」を超え、その才能を世界の舞台へ。</p>
      <div class="hero-actions">
        <a href="#services" class="btn btn-primary">事業を見る →</a>
        <a href="#mission" class="btn btn-ghost">わたしたちの想い</a>
      </div>
    </div>
    <div class="seal-stage">
      <div class="seal">
        <span class="seal-orbit-label">INTERESTING ＋ LAUGH</span>
        <div class="ring"></div>
        <div class="ring inner"></div>
        <div class="disc">
          <div class="kanji">巻<small>MAKIKOMU</small></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- MISSION -->
<section class="mission" id="mission">
  <div class="wrap">
    <span class="eyebrow">Our Philosophy ／ 理念</span>
    <p class="mission-q reveal">日本のクリエイターには、<em>世界に通用する力</em>がある。足りないのは、才能ではなく、<em>巻き込む仕組み</em>だ。</p>
    <p class="reveal">Interaugh（インタラフ）は「Interesting」と「Laugh」を掛け合わせた造語。社会課題を解きほぐし、人類の笑顔に貢献する——その姿勢で、Web3技術を日本の才能と結び、海外進出の壁を越えていきます。</p>
    <div class="mission-stats reveal">
      <div class="stat"><div class="n">2019</div><div class="l">FOUNDED ／ 設立</div></div>
      <div class="stat"><div class="n">3</div><div class="l">CORE PRODUCTS ／ 主力事業</div></div>
      <div class="stat"><div class="n">和×Web3</div><div class="l">OUR FORMULA ／ 掛け算</div></div>
    </div>
  </div>
</section>

<!-- SERVICES -->
<section class="services" id="services">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <span class="eyebrow">Products ／ 事業</span>
        <h2>三つの札で、<br>世界とつながる。</h2>
      </div>
      <p>花札のように、それぞれが固有の役割を持つ。NFTを「むずかしい技術」で終わらせない、生活に馴染むプロダクト群。</p>
    </div>
    <div class="cards">

      <article class="fuda reveal">
        <span class="idx">壱の札</span>
        <div class="cloud"></div>
        <div class="motif" aria-hidden="true">
          <svg viewBox="0 0 90 96" fill="none" stroke="#C9A24B" stroke-width="2.2" stroke-linecap="round">
            <path d="M45 90V30"/><path d="M45 40C45 40 30 32 22 38"/><path d="M45 52C45 52 60 44 68 50"/>
            <path d="M45 64C45 64 32 58 26 64"/>
            <g stroke="#7C8B4E"><path d="M45 30c-6-10-2-18 0-22 2 4 6 12 0 22Z"/></g>
            <circle cx="45" cy="22" r="4" fill="#E0432C" stroke="none"/>
          </svg>
        </div>
        <span class="tag">NFT TICKETING ／ LINE</span>
        <h3>Nチケ</h3>
        <div class="jp-sub">エヌチケ</div>
        <p>LINEのなかで完結する、NFTチケット。発行も、ユーザー同士の受け渡しも、いつものトークから。むずかしいウォレット操作は要りません。</p>
        <a class="more" href="#contact">くわしく <span>→</span></a>
      </article>

      <article class="fuda reveal">
        <span class="idx">弐の札</span>
        <div class="cloud"></div>
        <div class="motif" aria-hidden="true">
          <svg viewBox="0 0 90 96" fill="none" stroke="#C9A24B" stroke-width="2.2" stroke-linecap="round">
            <circle cx="30" cy="40" r="9"/><circle cx="60" cy="34" r="9"/><circle cx="45" cy="62" r="9"/>
            <path d="M37 46 53 56"/><path d="M53 41 51 53"/>
            <circle cx="30" cy="40" r="3" fill="#E0432C" stroke="none"/>
            <circle cx="60" cy="34" r="3" fill="#4B6FD4" stroke="none"/>
            <circle cx="45" cy="62" r="3" fill="#7C8B4E" stroke="none"/>
          </svg>
        </div>
        <span class="tag">COMMUNITY ／ 多言語</span>
        <h3>KATAOMOI</h3>
        <div class="jp-sub">カタオモイ</div>
        <p>多言語コミュニケーションで、ファンと作り手をつなぐコミュニティ基盤。言葉の違いを越えて、「好き」が出会う場所をつくります。</p>
        <a class="more" href="#contact">くわしく <span>→</span></a>
      </article>

      <article class="fuda reveal">
        <span class="idx">参の札</span>
        <div class="cloud"></div>
        <div class="motif" aria-hidden="true">
          <svg viewBox="0 0 90 96" fill="none" stroke="#C9A24B" stroke-width="2.2" stroke-linecap="round">
            <g stroke="#E0432C">
              <path d="M45 30c5 5 5 11 0 15-5-4-5-10 0-15Z"/>
              <path d="M45 45c7-2 12 2 13 9-7 1-12-2-13-9Z"/>
              <path d="M45 45c-7-2-12 2-13 9 7 1 12-2 13-9Z"/>
              <path d="M45 45c4 7 2 13-3 17-3-6-2-12 3-17Z"/>
              <path d="M45 45c-4 7-2 13 3 17 3-6 2-12-3-17Z"/>
            </g>
            <circle cx="45" cy="45" r="3.4" fill="#C9A24B" stroke="none"/>
            <path d="M20 80c14-6 36-6 50 0" stroke="#C9A24B"/>
          </svg>
        </div>
        <span class="tag">SELF EXPRESSION ／ 和紙</span>
        <h3>CryptoWashi</h3>
        <div class="jp-sub">クリプト和紙</div>
        <p>和紙という日本の伝統と、NFTの真正性を融合。デジタル名刺やNFT花札で、「あなたであること」をそのまま価値にします。</p>
        <a class="more" href="#contact">くわしく <span>→</span></a>
      </article>

    </div>
  </div>
</section>

<!-- CRAFT -->
<section class="craft" id="craft">
  <div class="wrap craft-grid">
    <div class="reveal">
      <span class="eyebrow">Creative Studio</span>
      <h2>つくる力も、<br>うちにある。</h2>
      <p style="color:var(--washi-dim);margin-top:1em;font-size:.9rem;max-width:26ch">企画から制作まで。表現の上流を、まるごと内製で。</p>
    </div>
    <div class="craft-list reveal">
      <div class="item"><div class="k">01 / CG</div><div class="t">3DCGモデリング</div><div class="d">キャラクター・プロダクト</div></div>
      <div class="item"><div class="k">02 / ART</div><div class="t">イラスト</div><div class="d">キービジュアル・原画</div></div>
      <div class="item"><div class="k">03 / FILM</div><div class="t">動画編集</div><div class="d">PR・SNSショート</div></div>
      <div class="item"><div class="k">04 / WEB</div><div class="t">Webデザイン</div><div class="d">LP・サイト構築</div></div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta" id="contact">
  <div class="wrap">
    <span class="eyebrow" style="justify-content:center">Get in touch ／ お問い合わせ</span>
    <h2>その才能、<span class="shu">巻き込ませて</span><br>ください。</h2>
    <p>事業のご相談、制作のご依頼、協業のお声がけ——。日本から世界へ、いっしょに踏み出しましょう。</p>
    <a href="mailto:contact@interaugh.com" class="btn btn-primary">contact@interaugh.com →</a>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <div class="brand" style="display:flex;align-items:center;gap:.5em"><span class="seal-mini">巻</span>Interaugh</div>
      <p>Web3と日本のものづくりで、才能を世界の舞台へ。Interaugh合同会社。</p>
    </div>
    <div class="foot-col">
      <h4>Products</h4>
      <a href="#services">Nチケ</a>
      <a href="#services">KATAOMOI</a>
      <a href="#services">CryptoWashi</a>
    </div>
    <div class="foot-col">
      <h4>Contact</h4>
      <span class="li">〒277-8520<br>千葉県柏市 柏の葉キャンパス</span>
      <a href="tel:047-114-3014">047-114-3014</a>
      <a href="mailto:contact@interaugh.com">contact@interaugh.com</a>
    </div>
  </div>
  <div class="wrap foot-bottom">
    <span>© 2019–2026 Interaugh LLC.</span>
    <span>INTERESTING ＋ LAUGH</span>
  </div>
</footer>
`;

export function LandingPage() {
  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: landingHtml }} />
      <LandingPageEffects />
    </>
  );
}
