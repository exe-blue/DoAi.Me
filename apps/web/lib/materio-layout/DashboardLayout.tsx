"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  alpha,
} from "@mui/material";
import {
  Dashboard as OpsIcon,
  List as ChannelsIcon,
  VideoLibrary as ContentsIcon,
  EventNote as EventsIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft,
} from "@mui/icons-material";
import IconButton from "@mui/material/IconButton";
import { StatusStrip } from "./StatusStrip";

const SIDEBAR_WIDTH = 260;

const navItems: { key: string; href: string; label: string; icon: React.ReactNode }[] = [
  { key: "ops", href: "/ops", label: "Operations", icon: <OpsIcon /> },
  { key: "youtube.channels", href: "/youtube/channels", label: "YouTube — Channels", icon: <ChannelsIcon /> },
  { key: "youtube.contents", href: "/youtube/contents", label: "YouTube — Contents", icon: <ContentsIcon /> },
  { key: "events", href: "/events", label: "Events / Logs", icon: <EventsIcon /> },
  { key: "settings", href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const theme = useTheme();
  const [open, setOpen] = useState(true);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
      <StatusStrip />
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Drawer
          variant="permanent"
          open={open}
          sx={{
            width: open ? SIDEBAR_WIDTH : theme.spacing(8),
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: open ? SIDEBAR_WIDTH : theme.spacing(8),
              boxSizing: "border-box",
              borderRight: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              transition: theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
            },
          }}
        >
          <Toolbar
            sx={{
              justifyContent: open ? "space-between" : "center",
              minHeight: 64,
              px: 1,
            }}
          >
            {open && (
              <Typography variant="h6" noWrap component={Link} href="/ops" sx={{ textDecoration: "none", color: "inherit", fontWeight: 700 }}>
                DoAi.Me
              </Typography>
            )}
            <IconButton onClick={() => setOpen(!open)} size="small">
              {open ? <ChevronLeft /> : <MenuIcon />}
            </IconButton>
          </Toolbar>
          <List component="nav" sx={{ px: 1, flex: 1 }}>
            {navItems.map((item) => {
              const active = pathname === item.href || (item.key !== "youtube" && pathname.startsWith(item.href));
              return (
                <ListItemButton
                  key={item.key}
                  component={Link}
                  href={item.href}
                  selected={active}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    "&.Mui-selected": {
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  {open && <ListItemText primary={item.label} />}
                </ListItemButton>
              );
            })}
          </List>
          {/* Sidebar watermark: very subtle, non-interactive */}
          <Box
            sx={{
              position: "relative",
              height: 100,
              flexShrink: 0,
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.08,
              pointerEvents: "none",
            }}
            aria-hidden
          >
            <Image
              src="/illustrations/illu-char-1.png"
              alt=""
              width={80}
              height={80}
              style={{ objectFit: "contain" }}
            />
          </Box>
        </Drawer>
        <Box component="main" sx={{ flexGrow: 1, p: 3, width: "100%", maxWidth: "100%" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
