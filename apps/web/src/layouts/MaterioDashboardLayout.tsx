"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import SubscriptionsOutlinedIcon from "@mui/icons-material/SubscriptionsOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

const SIDEBAR_WIDTH = 260;

const NAV = [
  { label: "Operations", href: "/ops", icon: <DashboardOutlinedIcon /> },
  {
    label: "YouTube",
    children: [
      { label: "Channels", href: "/youtube/channels", icon: <SubscriptionsOutlinedIcon /> },
      { label: "Contents", href: "/youtube/contents", icon: <VideoLibraryOutlinedIcon /> },
    ],
  },
  { label: "Events", href: "/events", icon: <EventNoteOutlinedIcon /> },
  { label: "Settings", href: "/settings", icon: <SettingsOutlinedIcon /> },
];

export function MaterioDashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  const drawer = (
    <Box sx={{ width: SIDEBAR_WIDTH, mt: 2 }}>
      <Toolbar>
        <Typography variant="h6" noWrap component="span" color="primary">
          DoAi.Me
        </Typography>
      </Toolbar>
      <List disablePadding>
        {NAV.map((item) =>
          "href" in item ? (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={pathname === item.href}
              sx={{ mx: 1, borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ) : (
            <Box key={item.label}>
              <Typography variant="caption" sx={{ px: 2, py: 1, display: "block", color: "text.secondary" }}>
                {item.label}
              </Typography>
              {item.children?.map((c) => (
                <ListItemButton
                  key={c.href}
                  component={Link}
                  href={c.href}
                  selected={pathname === c.href}
                  sx={{ mx: 1, borderRadius: 1, pl: 3 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{c.icon}</ListItemIcon>
                  <ListItemText primary={c.label} />
                </ListItemButton>
              ))}
            </Box>
          )
        )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
          },
        }}
      >
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: "background.default", minHeight: "100vh" }}>
        {children}
      </Box>
    </Box>
  );
}
