import { removeBase, usePage } from '@rspress/core/runtime';
import {
  Layout as DefaultLayout, HomeHero, HomeFeature, HomeFooter, DocContent,
  type HomeLayoutProps,
} from '@rspress/core/theme-original';
import { DocumentGraphic } from './DocumentGraphic';

function HomeLayout(props: HomeLayoutProps) {
  return (
    <main className="hwpjs-home">
      <div className="hwpjs-home-hero">
        {props.beforeHero}
        <HomeHero image={<DocumentGraphic />} />
        {props.afterHero}
      </div>
      <section className="hwpjs-home-features" aria-label="HWPJS 구성">
        {props.beforeFeatures}
        <HomeFeature />
        {props.afterFeatures}
      </section>
      <section className="hwpjs-home-reading rp-doc" aria-label="문서 안내">
        <DocContent components={undefined} isOverviewPage />
      </section>
      <HomeFooter />
    </main>
  );
}

export function Layout() {
  const { page } = usePage();
  const route = removeBase(page.routePath).replace(/\.html$/, '').replace(/\/$/, '');
  const mode = route === '/playground' ? 'playground' : page.pageType === 'home' ? 'home' : 'doc';
  return (
    <div className="hwpjs-theme" data-page={mode}>
      <DefaultLayout HomeLayout={HomeLayout}
        afterNavTitle={<span className="hwpjs-format-badge" aria-label="지원 문서 형식">HWP5 · HWPX</span>} />
    </div>
  );
}

export * from '@rspress/core/theme-original';
