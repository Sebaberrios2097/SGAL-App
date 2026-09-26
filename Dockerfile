FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["SgalApp.Api/SgalApp.Api.csproj", "SgalApp.Api/"]
COPY ["SgalApp.Infrastructure/SgalApp.Infrastructure.csproj", "SgalApp.Infrastructure/"]
RUN dotnet restore "SgalApp.Api/SgalApp.Api.csproj"

COPY SgalApp.Api/ SgalApp.Api/
COPY SgalApp.Infrastructure/ SgalApp.Infrastructure/
RUN dotnet publish "SgalApp.Api/SgalApp.Api.csproj" \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
LABEL org.opencontainers.image.title="SGAL App API"

# Fuentes necesarias para generar PDF (SystemPdfFontResolver busca DejaVu)
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
RUN mkdir -p /app/dp-keys /app/license-data \
    && chown -R $APP_UID:$APP_UID /app/dp-keys /app/license-data
USER $APP_UID
ENTRYPOINT ["dotnet", "SgalApp.Api.dll"]
