from app import create_app

# 앱 생성
app = create_app()

if __name__ == '__main__':
    app.run(debug=True) 