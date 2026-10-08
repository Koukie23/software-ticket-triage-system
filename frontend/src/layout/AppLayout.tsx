import { useEffect, useState } from "react";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Menu, Tag } from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";

const titles: Record<string, string> = {
  "/submit": "Submit ticket",
  "/tickets": "Tickets",
  "/stats": "Operations",
  "/experiments": "Model experiments",
};

const items = [
  { key: "/submit", label: <Link to="/submit">Submit ticket</Link> },
  { key: "/tickets", label: <Link to="/tickets">Tickets</Link> },
  { key: "/stats", label: <Link to="/stats">Operations</Link> },
  { key: "/experiments", label: <Link to="/experiments">Model experiments</Link> },
];

export function AppLayout() {
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const compact = !screens.lg;
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<{ model: string; modelVersion: string | null } | null>(null);

  useEffect(() => {
    api
      .health()
      .then((result) => setHealth(result))
      .catch(() => setHealth({ model: "down", modelVersion: null }));
  }, [location.pathname]);

  const selected = location.pathname.startsWith("/tickets")
    ? "/tickets"
    : titles[location.pathname]
      ? location.pathname
      : "/submit";
  const pageTitle = location.pathname.startsWith("/tickets/") ? "Ticket detail" : titles[selected] ?? "Issue triage";
  const menu = (
    <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={() => setOpen(false)} style={{ border: "none" }} />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {compact ? (
        <Drawer title="Issue triage" placement="left" width={216} open={open} onClose={() => setOpen(false)}>
          {menu}
        </Drawer>
      ) : (
        <Layout.Sider width={216} theme="light" className="app-sider">
          <div className="brand">Issue triage</div>
          {menu}
        </Layout.Sider>
      )}
      <Layout>
        <Layout.Header className="app-header">
          <div className="header-left">
            {compact ? (
              <Button type="text" icon={open ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} onClick={() => setOpen((v) => !v)} />
            ) : null}
            <h1>{pageTitle}</h1>
            {selected === "/stats" ? <Tag color="blue">Live tickets</Tag> : null}
            {selected === "/experiments" ? <Tag color="purple">Offline experiments</Tag> : null}
          </div>
          <Tag color={health?.model === "ok" ? "success" : "error"}>
            {health?.model === "ok" ? `Model healthy${health.modelVersion ? ` · ${health.modelVersion}` : ""}` : "Model unavailable"}
          </Tag>
        </Layout.Header>
        <Layout.Content className="app-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
