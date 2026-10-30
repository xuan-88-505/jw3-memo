import NotFound from "@/pages/NotFound";
import { Fragment } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WINDOW_LABEL } from "./lib/desktop";
import { useLang } from "./lib/i18n";
import DesktopManager from "./pages/DesktopManager";
import DesktopPanel from "./pages/DesktopPanel";
import Home from "./pages/Home";
import ManagerPage from "./pages/ManagerPage";
import PanelPage from "./pages/PanelPage";
import { ProtoProvider } from "./state/store";

function Router() {
  // 桌面版：两个窗口加载同一个页面，按窗口选择界面
  if (WINDOW_LABEL === "panel") return <DesktopPanel />;
  if (WINDOW_LABEL === "manager") return <DesktopManager />;
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/panel"} component={PanelPage} />
      <Route path={"/manager"} component={ManagerPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * 换语言时整个界面重新挂载，所有文字按新语言重新算。
 * 数据在外层的 ProtoProvider 里，不受影响。
 */
function LangRoot() {
  const lang = useLang();
  // 桌面版的两个窗口自己按语言重新挂载里面的界面
  if (WINDOW_LABEL) return <Router />;
  return (
    <Fragment key={lang}>
      <Router />
    </Fragment>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        {/* 状态放在路由外面：在 /panel 和 /manager 之间切换时数据不丢 */}
        <ProtoProvider>
          <LangRoot />
        </ProtoProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
