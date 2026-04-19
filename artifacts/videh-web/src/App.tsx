import { Switch, Route, Router as WouterRouter } from "wouter";
import VidehWeb from "@/pages/VidehWeb";
import NotFound from "@/pages/not-found";

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={VidehWeb} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
