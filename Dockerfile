FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["SieteVidasAPI/SieteVidasAPI.csproj", "SieteVidasAPI/"]
COPY ["Infraestructura/Infraestructura.csproj", "Infraestructura/"]
RUN dotnet restore "SieteVidasAPI/SieteVidasAPI.csproj"

COPY SieteVidasAPI/ SieteVidasAPI/
COPY Infraestructura/ Infraestructura/
RUN dotnet publish "SieteVidasAPI/SieteVidasAPI.csproj" \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/Sebaberrios2097/SieteVidasAPI"
ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "SieteVidasAPI.dll"]
