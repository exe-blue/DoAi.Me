import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#7367F0", contrastText: "#fff" },
    secondary: { main: "#CE9B00", contrastText: "#fff" },
    success: { main: "#28C76F", contrastText: "#fff" },
    warning: { main: "#FF9F43", contrastText: "#fff" },
    error: { main: "#EA5455", contrastText: "#fff" },
    background: { default: "#F4F5FA", paper: "#fff" },
  },
});
