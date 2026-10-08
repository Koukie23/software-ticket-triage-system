import type { ThemeConfig } from "antd";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff",
    colorBgLayout: "#f5f7fa",
    colorBgContainer: "#ffffff",
    borderRadius: 8,
    fontFamily: '"PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif',
    colorBorderSecondary: "#f0f0f0",
  },
  components: {
    Layout: {
      siderBg: "#ffffff",
      headerBg: "#ffffff",
      headerHeight: 56,
      bodyBg: "#f5f7fa",
    },
    Menu: {
      itemBg: "#ffffff",
      itemSelectedBg: "#e6f4ff",
      itemSelectedColor: "#1677ff",
    },
    Card: {
      boxShadowTertiary: "none",
    },
  },
};

export const colors = {
  bug: "#cf1322",
  feature: "#1677ff",
  question: "#389e0d",
  review: "#d48806",
  reviewRow: "#fffbe6",
};
